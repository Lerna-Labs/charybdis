const {Lucid, Blockfrost, Data, fromText, generatePrivateKey,
    PROTOCOL_PARAMETERS_DEFAULT
} = require("@lucid-evolution/lucid");
const axios = require("axios");

let lucid;

async function getUsableUTxO(criteria = {}, HYDRA_NODE_URL) {
    /**
     * Queries the Hydra node's UTxO set and identifies a UTxO that matches the given criteria.
     *
     * @param {object} criteria - The filtering criteria for selecting a UTxO.
     *                             Example: { policyId: "abc", tokenName: "MyToken" }.
     * @returns {object} - The matching UTxO or null if no match is found.
     */
    try {
        // Query the UTxOs from the Hydra node
        const response = await axios.get(`${HYDRA_NODE_URL}/snapshot/utxo`);
        const utxos = response.data; // The list of UTxOs

        console.log("Hydra UTxOs:", utxos);

        // Iterate over the UTxOs to find a match
        for (const [utxoId, utxoDetails] of Object.entries(utxos)) {
            const {address, value} = utxoDetails;

            // Check if the address matches (if provided in criteria)
            if (criteria.address && criteria.address !== address) {
                continue; // Skip this UTxO if the address doesn't match
            }

            // Check if the UTxO matches the filtering criteria
            if (criteria.policyId && criteria.tokenName) {
                const policy = value[criteria.policyId];
                if (policy && policy[criteria.tokenName] && policy[criteria.tokenName] > 0) {
                    console.log("Found usable UTxO:", utxoDetails);
                    return {utxoId, ...utxoDetails};
                }
            } else {
                // If no criteria provided, return the first UTxO
                console.log("Returning first UTxO:", utxoDetails);
                return {utxoId, ...utxoDetails};
            }
        }

        if (usableUTxO) {
            console.log("Found usable UTxO:", usableUTxO);
            return usableUTxO;
        } else {
            console.log("No suitable UTxO found.");
            return null;
        }
    } catch (error) {
        console.error("Error querying Hydra UTxOs:", error.message);
        throw new Error("Failed to query Hydra UTxOs.");
    }
}

async function initializeLucid(apiKey, network = "Preview") {
    /**
     * Initialize Lucid with Blockfrost backend and select a wallet.
     *
     * @param {string} apiKey - Your Blockfrost API key.
     * @param {string} network - Cardano network ("Preview", "Preprod", or "Mainnet").
     */
    lucid = await Lucid(
        new Blockfrost(`https://cardano-${network.toLowerCase()}.blockfrost.io/api/v0`, apiKey),
        network,
        {
            presetProtocolParameters: {
                ...PROTOCOL_PARAMETERS_DEFAULT,
                minFeeA: 0,
                minFeeB: 0,
            }
        }
    );

}

const CIP68DatumSchema = Data.Object({
    metadata: Data.Map(Data.Any(), Data.Any()),
    version: Data.Integer(),
});

const CIP68Datum = CIP68DatumSchema;

function validateMetadata(metadata) {
    console.log("Validating metadata:", metadata);

    const metadataMap = new Map();

    Object.entries(metadata).map(([key, value]) => {
        switch (typeof value) {
            case "string":
                metadataMap.set(fromText(key), fromText(value));
                break;
            case "object":
                if (Array.isArray(value)) {
                    const values = [];
                    value.forEach((item) => {
                        // Recursion ftw
                        values.push(validateMetadata(item));
                    });
                    metadataMap.set(fromText(key), values);
                } else {
                    // Get recursive with it
                    metadataMap.set(fromText(key), validateMetadata(value));
                }
                break;
            case 'boolean':
            case 'number':
            case 'bigint':
                // when in doubt, cast to string representation
                metadataMap.set(fromText(key), fromText(value.toString()));
                break;
            default:
                // throw an error but still try to insert it via text/string representation of the thing
                console.log(`Unhandled: `, typeof value);
                metadataMap.set(fromText(key), fromText(value.toString()));
        }
    });

    return metadataMap;
}

function hydraToLucidValue(value) {
    const lucid_value = {
        lovelace: BigInt(value.lovelace)
    };

    Object.entries(value).forEach(([key, tokens]) => {
        if (key === "lovelace") {
            return;
        }

        Object.entries(tokens).forEach(([token_name, quantity]) => {
            lucid_value[`${key}${token_name}`] = BigInt(quantity);
        })
    });

    return lucid_value;

}

function hydraToLucidTx(utxo) {
    const {utxoId, address, value, datum, datumhash, referenceScript} = utxo;
    const [txHash, outputIndex] = utxoId.split('#');
    const tx = {
        txHash,
        outputIndex,
        address,
        assets: hydraToLucidValue(value),
        datumHash: datumhash || undefined,
        datum: datum || undefined,
        scriptRef: referenceScript || undefined
    };
    return tx;
}

async function createReferenceToken(policyId, tokenName, metadata, address) {
    /**
     * Create a CIP-68 reference token and attach metadata as a datum.
     *
     * @param {string} policyId - The policy ID for the token.
     * @param {string} tokenName - The name of the token.
     * @param {object} metadata - The CIP-68 metadata object.
     *
     * @returns {string} - The transaction hash.
     */
    if (!lucid) throw new Error("Lucid is not initialized.");

    let datum;
    try {
        const transformedMetadata = validateMetadata(metadata);
        datum = Data.to(
            {metadata: transformedMetadata, version: 1n},
            CIP68Datum,
        );
        console.log(`Datum is`, datum);
    } catch (error) {
        console.error("Error serializing metadata to Plutus format:", error.message);
        throw new Error("Metadata contains unsupported types.");
    }


    const tx = await lucid
        .newTx()
        .pay.ToAddressWithData(address, datum, {[`${policyId}.${tokenName}`]: BigInt(1)})
        /*.payToAddressWithDatum(
            address,
            {[`${policyId}.${tokenName}`]: BigInt(1)}, // Token details
            datum
        )*/
        .complete();


    console.log(tx.toCBOR());
    // const signedTx = await lucid.wallet.signTx(tx);
    // return await lucid.submitTx(signedTx);
}

async function updateMetadata(policyId, tokenName, updatedMetadata, utxo, signing_key) {
    /**
     * Update CIP-68 metadata attached to a token in an active Hydra head.
     *
     * @param {string} policyId - The policy ID for the token.
     * @param {string} tokenName - The name of the token.
     * @param {object} updatedMetadata - The updated CIP-68 metadata.
     *
     * @returns {string} - The transaction hash.
     */
    if (!lucid) throw new Error("Lucid is not initialized.");

    // const datum = Data.to(updatedMetadata);
    let datum;
    try {
        const transformedMetadata = validateMetadata(updatedMetadata);
        datum = Data.to(
            {metadata: transformedMetadata, version: 1n},
            CIP68Datum,
        );
        console.log(`Datum is`, datum);
    } catch (error) {
        console.error("Error serializing metadata to Plutus format:", error.message);
        throw new Error("Metadata contains unsupported types.");
    }

    lucid.selectWallet.fromPrivateKey(signing_key);

    const output_token = hydraToLucidValue(utxo.value);
    delete output_token.lovelace;

    const tx = await lucid
        .newTx()
        .collectFrom([hydraToLucidTx(utxo)])
        .pay.ToAddressWithData(
            utxo.address,
            {kind: "inline", value: datum},
            output_token
        )
        .complete()

    console.log(tx.toCBOR());

    const signedTx = await tx.sign.withWallet().complete();
    console.log(`Signed Tx`, signedTx.toCBOR());
}


module.exports = {
    initializeLucid,
    createReferenceToken,
    updateMetadata,
    getUsableUTxO
};
