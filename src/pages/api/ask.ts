import type { NextApiRequest, NextApiResponse } from 'next';
import { PromptTemplate } from '@langchain/core/prompts';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const sessionStore: { [key: string]: string[] } = {};

// Template for DeepSeek model
const TEMPLATE = `
    Based on the provided context from the equipment guide, answer the user's question using the information in the context as much as possible. Make sure to sound like an expert firefighter and provide guidance on maintaining and caring for firefighting equipment.

    If the answer isn’t fully covered in the guide, provide supportive and accurate information to answer the question. Use the context to strengthen your response.

    Deliver a detailed and direct answer without repeating the user’s input or motivational phrases unless needed. If the question is repeated, offer additional specific details not covered in previous responses.

    Avoid mentioning that the information is based on the guide.

    ==============================
    Equipment Guide Context: {context}
    ==============================
    Current conversation: {chat_history}

    User: {question}
    Assistant:
`;

const equipmentDataLinks = [
    'https://eca-seven.vercel.app/docs/data.json',
];

const equipmentImages: Record<string, string> = {
    "Helmet": "https://i.ibb.co/Jt6LRcL/helmet.png",
    "Boots": "https://i.ibb.co/4Fb3qhb/boots.png",
    "Gloves": "https://i.ibb.co/yybFGL2/gloves.png",
    "Turnout Gear": "https://i.ibb.co/H2GSbh3/Turnout-Gear.png",
    "SCBA": "https://i.ibb.co/LCVsW9Y/SCBA.png",
    "Hood": "https://i.ibb.co/8MqnpP9/hood.png",
    "Firefighter Mask": "https://i.ibb.co/LCVsW9Y/SCBA.png",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { question, sessionId } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    const session = sessionId || uuidv4();
    const chatHistory = sessionStore[session] || [];

    try {
        const dataPromises = equipmentDataLinks.map(async (link) => {
            const response = await axios.get(link);
            return response.data;
        });

        const equipmentData = await Promise.all(dataPromises);
        const combinedContext = equipmentData.map(data => JSON.stringify(data)).join('\n');
        const context = combinedContext.slice(0, 10000);

        // Prepare the prompt
        const promptTemplate = new PromptTemplate({
            template: TEMPLATE,
            inputVariables: ['context', 'chat_history', 'question'],
        });

        const prompt = await promptTemplate.format({
            context,
            chat_history: chatHistory.join('\n'),
            question,
        });

        // Send request to local Ollama DeepSeek model
        const ollamaResponse = await axios.post('http://62.72.0.107:11434/api/generate', {
            model: "deepseek-r1:1.5b",
            prompt,
            stream: false,
        });

        const answer = ollamaResponse.data.response.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        // Determine related equipment image
        const equipmentType = Object.keys(equipmentImages).find(type => 
            question.toLowerCase().includes(type.toLowerCase())
        );
        const imageUrl = equipmentType ? equipmentImages[equipmentType] : null;

        // Update chat history
        chatHistory.push(`User: ${question}`, `Assistant: ${answer}`);
        sessionStore[session] = chatHistory;

        res.status(200).json({ answer, imageUrl, sessionId: session });
        

        console.log(ollamaResponse.data);



    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error processing the request' });
    }


}
