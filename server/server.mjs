/**
 * RIDELOG Isolated Backend Server
 * Serves the zero-build static SPA and provides secure server-side API endpoints:
 * - GET  /api/health
 * - POST /api/bikes/identify  (Master catalogue search & Gemini AI enrichment)
 * - POST /api/user/bikes      (Clerk-authenticated user bike creation)
 */

import './loadEnv.mjs';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { firestoreAdmin } from './services/firestoreAdmin.mjs';
import { aiProvider, normalizeBikeModelId } from './services/aiProvider.mjs';
import { authVerifier } from './services/authVerifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const PORT = parseInt(process.env.PORT || '8080', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) { // 1MB limit
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle API requests
 */
async function handleApiRequest(req, res, pathname) {
  // 1. GET /api/health
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'RIDELOG Secure API',
      timestamp: new Date().toISOString(),
      database: {
        projectId: process.env.FIREBASE_PROJECT_ID || 'ridelog-796ba',
        mode: firestoreAdmin.isLiveConfigured() ? 'live_firestore' : 'development_store',
        collections: ['bikeModels', 'users', 'userBikes']
      },
      ai: {
        provider: 'Google Gemini',
        configured: aiProvider.isConfigured()
      },
      auth: {
        provider: 'Clerk',
        jwksConfigured: true,
        secretConfigured: Boolean(process.env.CLERK_SECRET_KEY)
      }
    });
  }

  // 2. POST /api/bikes/identify
  if (req.method === 'POST' && pathname === '/api/bikes/identify') {
    try {
      const body = await parseJsonBody(req);
      const query = (body.query || '').trim();

      if (!query) {
        return sendJson(res, 400, {
          success: false,
          error: 'Query parameter is required (e.g. "Royal Enfield Hunter 350")'
        });
      }

      // 1. Extract likely brand & model tokens for preliminary catalogue search
      const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      let brandGuess = '';
      let modelGuess = '';

      if (/royal\s*enfield|bullet|hunter|classic|meteor|himalayan/i.test(query)) {
        brandGuess = 'Royal Enfield';
        modelGuess = query.replace(/royal\s*enfield/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      } else if (/honda|cb350|hness/i.test(query)) {
        brandGuess = 'Honda';
        modelGuess = query.replace(/honda/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      } else if (/jawa|yezdi/i.test(query)) {
        brandGuess = 'Jawa';
        modelGuess = query.replace(/jawa/i, '').replace(/\b(19\d{2}|20\d{2})\b/, '').trim();
      }

      // Check existing Firestore bikeModels first (Master Catalogue Deduplication)
      if (brandGuess && modelGuess) {
        const existing = await firestoreAdmin.findMatchingBikeModel(brandGuess, modelGuess, year);
        if (existing) {
          console.log(`[API] Matched existing bikeModel in catalogue: ${existing.id}`);
          return sendJson(res, 200, {
            success: true,
            bikeModel: existing,
            isExistingCatalogueItem: true,
            message: 'Matched existing master catalogue entry.'
          });
        }
      }

      // 2. Not found in master catalogue: Use AI Provider to identify and structure
      console.log(`[API] Identifying motorcycle via AI for query: "${query}"`);
      const identifiedModel = await aiProvider.identify(query);

      // 3. Double-check if the normalized ID exists in Firestore
      const directMatch = await firestoreAdmin.getBikeModel(identifiedModel.id);
      if (directMatch) {
        console.log(`[API] Found existing document by normalized ID: ${identifiedModel.id}`);
        return sendJson(res, 200, {
          success: true,
          bikeModel: directMatch,
          isExistingCatalogueItem: true,
          message: 'Matched existing master catalogue entry.'
        });
      }

      // 4. Save to Firestore master catalogue if confident or valid brand & model
      if (identifiedModel.canAutoCatalog || (identifiedModel.brand && identifiedModel.model && identifiedModel.brand !== 'Unknown')) {
        await firestoreAdmin.saveBikeModel(identifiedModel.id, identifiedModel);
        console.log(`[API] Stored master bikeModel in catalogue: ${identifiedModel.id}`);
      }

      return sendJson(res, 200, {
        success: true,
        bikeModel: identifiedModel,
        isExistingCatalogueItem: false,
        message: 'Motorcycle identified successfully.'
      });
    } catch (err) {
      console.error('[API] /api/bikes/identify error:', err);
      return sendJson(res, 500, {
        success: false,
        error: err.message || 'Motorcycle identification failed'
      });
    }
  }

  // 3. POST /api/user/bikes (Clerk-authenticated user bike creation)
  if (req.method === 'POST' && pathname === '/api/user/bikes') {
    try {
      // 1. Verify Clerk Authentication Server-Side
      const authHeader = req.headers['authorization'];
      let verifiedUser = null;

      try {
        verifiedUser = await authVerifier.verifyToken(authHeader);
      } catch (authErr) {
        return sendJson(res, 401, {
          success: false,
          error: authErr.message || 'Unauthorized: Valid Clerk session required'
        });
      }

      // Derive clerkUserId STRICTLY from verified token
      const clerkUserId = verifiedUser.clerkUserId;
      const body = await parseJsonBody(req);

      if (!body.bikeModelId) {
        return sendJson(res, 400, {
          success: false,
          error: 'bikeModelId is required'
        });
      }

      // 2. Upsert user in `users/{clerkUserId}`
      await firestoreAdmin.upsertUser(clerkUserId, {
        name: verifiedUser.name || body.userName || '',
        email: verifiedUser.email || body.userEmail || ''
      });

      // 3. Create user bike record in `users/{clerkUserId}/userBikes/{userBikeId}`
      const userBike = await firestoreAdmin.addUserBike(clerkUserId, {
        bikeModelId: body.bikeModelId,
        nickname: body.nickname || '',
        registrationNumber: body.registrationNumber || '',
        purchaseDate: body.purchaseDate || null,
        currentOdometer: Number(body.currentOdometer) || 0,
        notes: body.notes || ''
      });

      console.log(`[API] User ${clerkUserId} confirmed bike ${body.bikeModelId} (userBike: ${userBike.id})`);

      return sendJson(res, 201, {
        success: true,
        clerkUserId,
        userBike,
        message: 'Motorcycle added to user garage.'
      });
    } catch (err) {
      console.error('[API] /api/user/bikes error:', err);
      return sendJson(res, 500, {
        success: false,
        error: err.message || 'Failed to add user motorcycle'
      });
    }
  }

  // Unknown API route
  return sendJson(res, 404, { success: false, error: 'API route not found' });
}

/**
 * Handle static file serving (Zero-Build Vanilla JS SPA)
 */
function handleStaticFile(req, res, pathname) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  // Clean query strings & hashes
  relativePath = relativePath.split('?')[0].split('#')[0];

  const safePath = path.normalize(path.join(PROJECT_ROOT, relativePath));

  // Security: prevent directory traversal
  if (!safePath.startsWith(PROJECT_ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA routing if path is not a file
      const indexPath = path.join(PROJECT_ROOT, 'index.html');
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith('/api/')) {
    return handleApiRequest(req, res, pathname);
  }

  return handleStaticFile(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` RIDELOG Server running at http://localhost:${PORT}`);
  console.log(` Static SPA root: ${PROJECT_ROOT}`);
  console.log(` Gemini AI: ${aiProvider.isConfigured() ? 'CONFIGURED' : 'DEV MODE (Model parser only, no fake specs)'}`);
  console.log(` Firestore Project: ${process.env.FIREBASE_PROJECT_ID || 'ridelog-796ba'}`);
  console.log(`====================================================`);
});
