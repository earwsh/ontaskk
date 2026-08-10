const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

interface AskOptions {
  system?: string;
  format?: 'json';
  temperature?: number;
  maxTokens?: number;
}

async function callGemini(
  model: string,
  contents: { role: string; parts: { text: string }[] }[],
  options: AskOptions
): Promise<string> {
  const { system, temperature = 0.3, maxTokens = 2048 } = options;

  const body: Record<string, any> = {
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
}

export async function askLLM(prompt: string, options: AskOptions = {}): Promise<string> {
  const { system } = options;

  const contents: { role: string; parts: { text: string }[] }[] = [];
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callGemini(GEMINI_MODEL, contents, options);
    } catch (err: any) {
      lastError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error('LLM request failed after retries');
}

export async function askLLMJSON<T>(prompt: string, options: AskOptions = {}): Promise<T> {
  const raw = await askLLM(prompt, {
    ...options,
    system: options.system
      ? `${options.system}\n\nپاسخ را فقط به صورت JSON معتبر برگردان و هیچ توضیح دیگری اضافه نکن.`
      : 'پاسخ را فقط به صورت JSON معتبر برگردان و هیچ توضیح دیگری اضافه نکن.',
  });
  const json = extractJSON(raw);
  if (!json) throw new Error('Failed to parse JSON from LLM response');
  return json as T;
}

function extractJSON(text: string): any | null {
  const jsonRegex = /```(?:json)?\s*([\s\S]*?)```/;
  const match = text.match(jsonRegex);
  const target = match ? match[1].trim() : text.trim();

  try {
    return JSON.parse(target);
  } catch {
    const braceStart = target.indexOf('{');
    const braceEnd = target.lastIndexOf('}');
    const bracketStart = target.indexOf('[');
    const bracketEnd = target.lastIndexOf(']');

    if (braceStart !== -1 && braceEnd > braceStart) {
      try {
        return JSON.parse(target.slice(braceStart, braceEnd + 1));
      } catch {}
    }
    if (bracketStart !== -1 && bracketEnd > bracketStart) {
      try {
        return JSON.parse(target.slice(bracketStart, bracketEnd + 1));
      } catch {}
    }
    return null;
  }
}
