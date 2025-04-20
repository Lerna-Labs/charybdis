require("dotenv").config();
const {
    initializeLucid,
    getUsableUTxO,
    updateMetadata, sendTx, hydraToLucidTx
} = require("./index");
const axios = require("axios");
const {ws} = require("./client");

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
        };
        const utxo = await getUsableUTxO(criteria, HYDRA_NODE_URL);

        if (utxo) {

            const hydra_utxo = [];

            utxo.forEach((a_utxo) => {
                hydra_utxo.push(hydraToLucidTx(a_utxo));
            })

            // console.log(utxo);
            // utxo.map((utxo) => {
            //     return hydraToLucidTx(utxo)
            // });

            console.log(hydra_utxo);

            const current_global_stats = await axios.get(process.env.STATS_ENDPOINT);

            if (current_global_stats.status !== 200) {
                throw new Error(`Could not fetch stats! ${current_global_stats.statusText}`);
            }

            const stats_data = current_global_stats.data;

            const token_metadata = {
                name: "Hydra DOOM Stats",
                image: "ipfs://QmfKYSqegVN9C1DaEBRg2stJivzp9jXPz3WdUdFrXVx5Ut",
                Artist: {
                    Maxi: "https://linktr.ee/Mad.maxi"
                },
                Stats: {
                    total_transactions: stats_data.total_txs,
                    peak_txs_per_second: Math.round(stats_data.peak_txs_per_second),
                    total_bytes: stats_data.total_bytes,
                    total_games: stats_data.total_games,
                    total_players: stats_data.total_players,
                    total_kills: stats_data.total_kills,
                }
            };

            const updateTxHex = await updateMetadata(POLICY_ID, TOKEN_NAME, token_metadata, hydra_utxo, SIGNING_KEY);

            console.log(updateTxHex);

            // const txOutput = await sendTx(updateTxHex, HYDRA_NODE_URL);
            // console.log(txOutput)
            ws.send(JSON.stringify({
                tag: "NewTx",
                transaction: {
                    type: "Tx ConwayEra",
                    description: "",
                    cborHex: updateTxHex
                }
            }));

            ws.close();

        } else {
            console.log("No usable UTxO found!");
        }
    } catch (error) {
        console.error("Error during test execution:", error.message);
    }
})();
