const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

export async function askOllama(prompt: string, system?: string): Promise<string> {
  const contents: { role: string; parts: { text: string }[] }[] = [];
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const body: Record<string, any> = {
    contents,
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': GEMINI_API_KEY,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Gemini error ${res.status}: ${text}`);
      }

      const data: any = await res.json();
      return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
    } catch (err: any) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error('LLM request failed after retries');
}
