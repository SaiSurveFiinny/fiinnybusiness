const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const models = await genAI.listModels();
        console.log("Available models:");
        for await (const model of models) {
            console.log(`- ${model.name} (${model.displayName})`);
        }
    } catch (error) {
        console.error("Error listing models:", error.message);
    }
}

listModels();
