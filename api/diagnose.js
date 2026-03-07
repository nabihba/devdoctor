import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// 1. Connect directly to your Upstash database
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 2. Configure the Rate Limiter: 5 requests per 60 seconds per IP
const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(5, '60 s'),
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 3. Block the Spammers
    const ip = req.headers['x-forwarded-for'] || '127.0.0.1';

    try {
        const { success } = await ratelimit.limit(ip);
        if (!success) {
            return res.status(429).json({ error: 'Woah, slow down! You have hit the limit. Please wait a minute and try again.' });
        }
    } catch (error) {
        console.error("Redis Error:", error);
    }

    let { text, imageBase64 } = req.body;

    // 4. Block massive payloads (Troll protection)
    if (text && text.length > 1000) {
        return res.status(400).json({ error: 'Text description is too long. Keep it under 1000 characters.' });
    }

    if (imageBase64 && imageBase64.length > 5500000) {
        return res.status(400).json({ error: 'Image file is too large. Please crop a smaller section.' });
    }

    if (text) {
        text = text.replace(/<[^>]*>?/gm, '').trim();
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const systemInstruction = `You are an empathetic technical support agent helping a complete beginner. ALWAYS respond in valid JSON format. 
        If given a specific error or screenshot, respond with: { "what": "plain English explanation", "where": "numbered steps to open terminal based on detected OS", "fix": "the exact command", "expected": "what they will see when it works" }. 
        If the input is vague, respond with: { "question": "Your simple multiple choice question here without technical jargon" }.`;

        const parts = [];
        if (text) parts.push({ text: text });
        if (imageBase64) {
            parts.push({
                inline_data: { mime_type: "image/jpeg", data: imageBase64 }
            });
        }

        const payload = {
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents: [{ parts: parts }],
            generationConfig: { responseMimeType: "application/json" }
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Failed to connect to AI');
        }

        const resultText = data.candidates[0].content.parts[0].text;
        const resultObj = JSON.parse(resultText);

        return res.status(200).json(resultObj);

    } catch (error) {
        console.error("Backend Error:", error);
        return res.status(500).json({ error: 'Failed to process diagnosis.' });
    }
}