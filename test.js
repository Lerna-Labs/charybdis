require("dotenv").config();
const {
    initializeLucid,
    getUsableUTxO,
    updateMetadata
} = require("./index");

(async () => {
    try {
        const API_KEY = process.env.BLOCKFROST_API_KEY;
        const NETWORK = process.env.NETWORK;
        const HYDRA_NODE_URL = process.env.HYDRA_NODE_URL;
        const POLICY_ID = process.env.POLICY_ID ?? 'your_policy_id';
        const TOKEN_NAME = process.env.TOKEN_NAME ?? 'your_token_name';
        const HYDRA_ADDRESS = process.env.HYDRA_ADDRESS ?? 'your_address';
        const SIGNING_KEY = process.env.SIGNING_KEY ?? 'your_signing_key';

        console.log("Initializing Lucid...");
        await initializeLucid(API_KEY, NETWORK);

        console.log("Querying Hydra UTxOs...");
        const criteria = {
            address: HYDRA_ADDRESS,
            policyId: POLICY_ID,
            tokenName: TOKEN_NAME
        };
        const utxo = await getUsableUTxO(criteria, HYDRA_NODE_URL);

        if (utxo) {
            console.log("Found UTxO:", utxo);
            // Example of creating some crazy metadata
            const metadata = {
                name: "Example Token",
                description: "A test token",
                image: "ipfs://abc123",
                nsfw: true,
                copyright: false,
                noFloats: 3.14,
                files: [
                    {
                        "src": "ipfs://abc246",
                        "mediaType": "image/jpeg"
                    }
                ],
                attributes: {
                    strength: 9,
                    perception: 12,
                    endurance: 8,
                    charisma: 7,
                    intelligence: 19,
                    agility: 3,
                    luck: 1
                },
                scientific: 3e10 - 1,
                scientificToo: 3e-5,
                bigInteger: 5000000n
            };

            // Example of updating metadata

            const updateHash = await updateMetadata(POLICY_ID, TOKEN_NAME, metadata, utxo);
            console.log("Updated metadata:", updateHash);
        } else {
            console.log("No usable UTxO found.");
        }
    } catch (error) {
        console.error("Error during test execution:", error.message);
    }
})();