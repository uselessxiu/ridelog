/**
 * AI Motorcycle Identification & Enrichment Service Layer
 * Interfaces with Google Gemini API to extract structured motorcycle data from user queries.
 *
 * Enforces strict verification rules:
 * - Does NOT invent, guess, or hallucinate technical specifications.
 * - Leaves unknown/uncertain specifications as null.
 * - AI-generated records are marked `verified: false`.
 * - Preserves reference sources.
 * - Development fallback identifies model name only without fabricating specs.
 */

export function normalizeBikeModelId(brand, model, year) {
  const clean = (str) =>
    (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const b = clean(brand);
  const m = clean(model);
  const y = String(year || new Date().getFullYear()).trim();

  return `${b}-${m}-${y}`.replace(/-+/g, '-');
}

export function validateAndCleanBikeModel(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid AI response: Expected structured object');
  }

  const brand = (raw.brand || '').trim();
  const model = (raw.model || '').trim();
  const year = Number(raw.year) || new Date().getFullYear();

  if (!brand || !model) {
    throw new Error('Could not reliably determine motorcycle brand and model name');
  }

  const bikeModelId = normalizeBikeModelId(brand, model, year);
  const now = new Date().toISOString();

  // Clean engine details - null if unknown
  const engine = {
    displacement: raw.engine?.displacement || null,
    type: raw.engine?.type || null,
    cooling: raw.engine?.cooling || null,
    fuelSystem: raw.engine?.fuelSystem || null
  };

  // Clean technical specifications - null if unknown
  const specs = raw.specifications || {};
  const specifications = {
    engine: {
      power: specs.engine?.power || null,
      torque: specs.engine?.torque || null
    },
    transmission: {
      type: specs.transmission?.type || null,
      gears: specs.transmission?.gears ? Number(specs.transmission.gears) : null,
      clutch: specs.transmission?.clutch || null
    },
    dimensions: {
      wheelbase: specs.dimensions?.wheelbase || null,
      seatHeight: specs.dimensions?.seatHeight || null,
      groundClearance: specs.dimensions?.groundClearance || null,
      kerbWeight: specs.dimensions?.kerbWeight || null
    },
    capacity: {
      fuelTank: specs.capacity?.fuelTank || null,
      oilCapacity: specs.capacity?.oilCapacity || null
    },
    brakes: {
      front: specs.brakes?.front || null,
      rear: specs.brakes?.rear || null,
      abs: specs.brakes?.abs || null
    },
    suspension: {
      front: specs.suspension?.front || null,
      rear: specs.suspension?.rear || null
    },
    wheelsAndTyres: {
      frontTyre: specs.wheelsAndTyres?.frontTyre || null,
      rearTyre: specs.wheelsAndTyres?.rearTyre || null
    },
    electrical: {
      battery: specs.electrical?.battery || null,
      headlamp: specs.electrical?.headlamp || null
    }
  };

  // Clean maintenance intervals - only if sourced
  const maintenance = {
    serviceIntervals: Array.isArray(raw.maintenance?.serviceIntervals) ? raw.maintenance.serviceIntervals : [],
    fluids: {
      engineOilGrade: raw.maintenance?.fluids?.engineOilGrade || null,
      brakeFluid: raw.maintenance?.fluids?.brakeFluid || null
    },
    consumables: {
      sparkPlug: raw.maintenance?.consumables?.sparkPlug || null,
      airFilter: raw.maintenance?.consumables?.airFilter || null
    }
  };

  // Keywords for Firestore search
  const keywords = Array.from(new Set([
    brand.toLowerCase(),
    model.toLowerCase(),
    `${brand.toLowerCase()} ${model.toLowerCase()}`,
    String(year),
    ...(Array.isArray(raw.searchKeywords) ? raw.searchKeywords.map(k => String(k).toLowerCase()) : [])
  ])).filter(Boolean);

  // Preserve sources
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map(s => ({
        title: typeof s === 'string' ? s : s?.title || 'Documentation reference',
        url: s?.url || null,
        verified: false
      }))
    : [];

  const isConfident = Boolean(raw.isConfident !== false && raw.confidenceScore >= 0.7);

  return {
    id: bikeModelId,
    brand,
    model,
    year,
    variant: raw.variant || '',
    category: raw.category || 'motorcycle',
    country: raw.country || 'India',
    engine,
    specifications,
    maintenance,
    documents: [],
    searchKeywords: keywords,
    sources,
    confidenceScore: raw.confidenceScore || (isConfident ? 0.9 : 0.5),
    reasoning: raw.reasoning || '',
    active: true,
    verified: false, // AI-generated data is NEVER automatically marked as manufacturer-verified
    canAutoCatalog: isConfident,
    createdAt: now,
    updatedAt: now
  };
}

class GeminiAiProvider {
  constructor() {
    this._apiKey = null;
  }

  get apiKey() {
    return process.env.GEMINI_API_KEY || this._apiKey || null;
  }

  isConfigured() {
    const key = this.apiKey;
    return Boolean(key && key.trim().length > 10);
  }

  /**
   * Identify motorcycle using Google Gemini Generative AI
   * @param {string} userQuery
   * @returns {Promise<Object>}
   */
  async identify(userQuery) {
    if (!this.isConfigured()) {
      return this._fallbackIdentify(userQuery);
    }

    const systemPrompt = `You are a motorcycle identification and technical specification extractor for RIDELOG.
The user will provide a free-text input representing a motorcycle they ride (e.g. "Royal Enfield Hunter 350", "RE Hunter", "Honda CB350 2024", "Jawa 42").

Analyze the input and identify the exact:
- brand (e.g. "Royal Enfield", "Honda", "Jawa", "KTM", "Triumph")
- model (e.g. "Hunter 350", "CB350", "42 Bobber", "Duke 390")
- year (manufacturing or release year, default to current/latest year e.g. 2024 or 2025 if unspecified)
- variant (trim or edition name e.g. "Metro Dapper", "H'ness", or null)
- category (e.g. "roadster", "cruiser", "classic", "naked", "adventure", "commuter", "sport")
- country (primary market, e.g. "India")

CRITICAL INTEGRITY & ACCURACY RULES:
1. Do NOT guess, invent, or hallucinate technical specifications.
2. If any technical specification (power, torque, displacement, cooling, dimensions, capacity, service intervals) is NOT definitively verified from manufacturer documentation, leave that field as null.
3. Do NOT merge specifications across different model years or generations.
4. List reliable reference sources (e.g. manufacturer websites) in the sources array.
5. Set "isConfident": true only if brand, model, and year are clearly recognized.
6. Set "confidenceScore" between 0.0 and 1.0.
7. Return ONLY valid JSON with no markdown wrapping.`;

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${systemPrompt}\n\nUSER INPUT: "${userQuery}"\n\nReturn the JSON structure now:` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1, // Low temperature for high factual accuracy
        topP: 0.95,
        responseMimeType: 'application/json'
      }
    };

    const candidateModels = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-pro-latest'];
    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
          const errorText = await res.text();
          console.warn(`[GeminiAiProvider] Model ${modelName} returned ${res.status}:`, errorText);
          lastError = new Error(`Gemini status ${res.status}`);
          continue;
        }

        const json = await res.json();
        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
          continue;
        }

        const cleanJsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleanJsonText);
        return validateAndCleanBikeModel(parsed);
      } catch (err) {
        lastError = err;
      }
    }

    console.warn('[GeminiAiProvider] All Gemini candidate models failed, using fallback parser:', lastError?.message);
    return this._fallbackIdentify(userQuery);
  }

  /**
   * Rule 6 compliant development fallback:
   * Identifies model name only, but NEVER fabricates specifications or writes unverified specs to Firestore.
   */
  _fallbackIdentify(userQuery) {
    const q = (userQuery || '').trim();
    let brand = 'Unknown';
    let model = q;
    let year = new Date().getFullYear();

    const qLower = q.toLowerCase();

    // Extract year if present (e.g. "2023", "2024", "2025")
    const yearMatch = q.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }

    if (qLower.includes('royal enfield') || qLower.startsWith('re ') || qLower.includes('bullet') || qLower.includes('hunter') || qLower.includes('classic 350') || qLower.includes('meteor') || qLower.includes('himalayan')) {
      brand = 'Royal Enfield';
      model = q.replace(/royal\s*enfield/i, '').replace(/^re\s+/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      if (!model) model = 'Hunter 350';
    } else if (qLower.includes('honda') || qLower.includes('cb350') || qLower.includes('hness')) {
      brand = 'Honda';
      model = q.replace(/honda/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      if (!model) model = 'CB350';
    } else if (qLower.includes('jawa') || qLower.includes('yezdi')) {
      brand = 'Jawa';
      model = q.replace(/jawa/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      if (!model) model = '42';
    } else if (qLower.includes('ktm') || qLower.includes('duke')) {
      brand = 'KTM';
      model = q.replace(/ktm/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      if (!model) model = 'Duke 390';
    } else {
      // General parsing
      const parts = q.split(/\s+/);
      if (parts.length > 1) {
        brand = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
        model = parts.slice(1).join(' ').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      }
    }

    const bikeModelId = normalizeBikeModelId(brand, model, year);

    return {
      id: bikeModelId,
      brand: brand,
      model: model,
      year: year,
      variant: '',
      category: 'motorcycle',
      country: 'India',
      engine: {
        displacement: null,
        type: null,
        cooling: null,
        fuelSystem: null
      },
      specifications: {
        engine: { power: null, torque: null },
        transmission: { type: null, gears: null, clutch: null },
        dimensions: { wheelbase: null, seatHeight: null, groundClearance: null, kerbWeight: null },
        capacity: { fuelTank: null, oilCapacity: null },
        brakes: { front: null, rear: null, abs: null },
        suspension: { front: null, rear: null },
        wheelsAndTyres: { frontTyre: null, rearTyre: null },
        electrical: { battery: null, headlamp: null }
      },
      maintenance: {
        serviceIntervals: [],
        fluids: { engineOilGrade: null, brakeFluid: null },
        consumables: { sparkPlug: null, airFilter: null }
      },
      documents: [],
      searchKeywords: [brand.toLowerCase(), model.toLowerCase()],
      sources: [],
      confidenceScore: 0.6,
      reasoning: 'Identified model name via local development parser. Technical specifications left blank per security rules (GEMINI_API_KEY not configured).',
      active: true,
      verified: false,
      canAutoCatalog: false, // Uncertain/fallback models are NOT automatically saved to master catalogue
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

export const aiProvider = new GeminiAiProvider();
