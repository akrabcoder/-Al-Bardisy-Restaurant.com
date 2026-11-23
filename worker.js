
/*
 * Al Bardisi Restaurant - Admin API
 * Cloudflare Worker
 *
 * Required Variables:
 * GITHUB_OWNER
 * GITHUB_REPO
 * GITHUB_BRANCH
 * CONTENT_PATH
 * ALLOWED_ORIGIN
 *
 * Required Secrets:
 * GITHUB_TOKEN
 * ADMIN_PASSWORD
 * SESSION_SECRET
 */

const SESSION_DURATION = 60 * 60; // 1 hour
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

const GITHUB_API = "https://api.github.com";

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (!isConfigured(env)) {
      return jsonResponse(
        { error: "Worker configuration is incomplete." },
        500,
        origin,
        env
      );
    }

    if (origin && origin !== env.ALLOWED_ORIGIN) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, env)
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/login" && request.method === "POST") {
        return await login(request, env, origin);
      }

      if (path === "/api/logout" && request.method === "POST") {
        await requireSession(request, env);
        return jsonResponse(
          { success: true },
          200,
          origin,
          env
        );
      }

      if (path === "/api/content" && request.method === "GET") {
        await requireSession(request, env);

        const data = await getGitHubContent(env);

        return jsonResponse(
          { success: true, data },
          200,
          origin,
          env
        );
      }

      if (path === "/api/content" && request.method === "PUT") {
        await requireSession(request, env);

        const body = await readJsonBody(request);

        if (!body || !body.data) {
          return jsonResponse(
            { error: "Missing content data." },
            400,
            origin,
            env
          );
        }

        validateContent(body.data);

        await saveGitHubContent(body.data, env);

        return jsonResponse(
          { success: true, message: "Content saved." },
          200,
          origin,
          env
        );
      }

      return jsonResponse(
        { error: "Endpoint not found." },
        404,
        origin,
        env
      );

    } catch (error) {
      const status = error.status || 500;

      return jsonResponse(
        {
          error:
            status >= 500
              ? "Server error. Please try again."
              : error.message
        },
        status,
        origin,
        env
      );
    }
  }
};

/* =========================================
   CONFIGURATION
========================================= */

function isConfigured(env) {
  const required = [
    "GITHUB_OWNER",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "CONTENT_PATH",
    "ALLOWED_ORIGIN",
    "GITHUB_TOKEN",
    "ADMIN_PASSWORD",
    "SESSION_SECRET"
  ];

  return required.every(
    key => typeof env[key] === "string" && env[key].trim() !== ""
  );
}

/* =========================================
   CORS
========================================= */

function corsHeaders(origin, env) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = env.ALLOWED_ORIGIN;
  }

  return headers;
}

function jsonResponse(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin, env)
    }
  });
}

/* =========================================
   REQUEST HELPERS
========================================= */

async function readJsonBody(request) {
  const declaredLength = Number(
    request.headers.get("Content-Length") || 0
  );

  if (declaredLength > MAX_BODY_SIZE) {
    throw httpError(413, "Request is too large.");
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).length > MAX_BODY_SIZE) {
    throw httpError(413, "Request is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Invalid JSON.");
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/* =========================================
   PASSWORD CHECK
========================================= */

function constantTimeEqual(a, b) {
  const encoder = new TextEncoder();
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));

  let difference = left.length ^ right.length;
  const maxLength = Math.max(left.length, right.length);

  for (let i = 0; i < maxLength; i++) {
    difference |=
      (left[i] || 0) ^ (right[i] || 0);
  }

  return difference === 0;
}

/* =========================================
   LOGIN
========================================= */

async function login(request, env, origin) {
  const body = await readJsonBody(request);

  if (
    !body ||
    typeof body.password !== "string" ||
    body.password.length > 200
  ) {
    throw httpError(400, "Invalid login request.");
  }

  if (!constantTimeEqual(body.password, env.ADMIN_PASSWORD)) {
    throw httpError(401, "Incorrect password.");
  }

  const token = await createSessionToken(env);

  return jsonResponse(
    {
      success: true,
      token,
      expiresIn: SESSION_DURATION
    },
    200,
    origin,
    env
  );
}

/* =========================================
   SESSION TOKEN
========================================= */

function base64UrlEncode(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded = base64.padEnd(
    Math.ceil(base64.length / 4) * 4,
    "="
  );

  const binary = atob(padded);

  return Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );
}

async function getSigningKey(env) {
  const encoder = new TextEncoder();

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign", "verify"]
  );
}

async function createSessionToken(env) {
  const payload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION,
    nonce: crypto.randomUUID()
  };

  const encodedPayload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload))
  );

  const key = await getSigningKey(env);

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload)
  );

  return (
    encodedPayload +
    "." +
    base64UrlEncode(new Uint8Array(signature))
  );
}

async function verifySessionToken(token, env) {
  if (
    typeof token !== "string" ||
    token.length > 2000
  ) {
    return false;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payloadPart, signaturePart] = parts;

  try {
    const key = await getSigningKey(env);

    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(payloadPart)
    );

    if (!valid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(
        base64UrlDecode(payloadPart)
      )
    );

    return (
      payload.role === "admin" &&
      Number.isInteger(payload.exp) &&
      payload.exp > Math.floor(Date.now() / 1000)
    );

  } catch {
    return false;
  }
}

async function requireSession(request, env) {
  const authorization = request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    throw httpError(401, "Please log in again.");
  }

  const token = authorization.slice(7);

  const valid = await verifySessionToken(token, env);

  if (!valid) {
    throw httpError(401, "Session expired. Please log in again.");
  }
}

/* =========================================
   CONTENT VALIDATION
========================================= */

function validateContent(data) {
  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data)
  ) {
    throw httpError(400, "Invalid content structure.");
  }

  if (!Array.isArray(data.menu)) {
    throw httpError(400, "Menu must be an array.");
  }

  if (!Array.isArray(data.branches)) {
    throw httpError(400, "Branches must be an array.");
  }

  if (
    typeof data.contact !== "object" ||
    data.contact === null ||
    Array.isArray(data.contact)
  ) {
    throw httpError(400, "Invalid contact information.");
  }

  if (
    typeof data.content !== "object" ||
    data.content === null ||
    Array.isArray(data.content)
  ) {
    throw httpError(400, "Invalid website content.");
  }

  if (data.menu.length > 500 || data.branches.length > 100) {
    throw httpError(400, "Too many items.");
  }

  const allowedMenuFields = [
    "id",
    "nameAr",
    "nameEn",
    "category",
    "price",
    "image",
    "descriptionAr",
    "descriptionEn"
  ];

  for (const item of data.menu) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      throw httpError(400, "Invalid menu item.");
    }

    for (const field of allowedMenuFields) {
      if (
        item[field] !== undefined &&
        !["string", "number"].includes(typeof item[field])
      ) {
        throw httpError(400, "Invalid menu item field.");
      }
    }
  }

  const allowedBranchFields = [
    "id",
    "name",
    "addressAr",
    "addressEn",
    "phone",
    "map"
  ];

  for (const branch of data.branches) {
    if (
      !branch ||
      typeof branch !== "object" ||
      Array.isArray(branch)
    ) {
      throw httpError(400, "Invalid branch.");
    }

    for (const field of allowedBranchFields) {
      if (
        branch[field] !== undefined &&
        typeof branch[field] !== "string"
      ) {
        throw httpError(400, "Invalid branch field.");
      }
    }
  }

  const serialized = JSON.stringify(data);

  if (serialized.length > MAX_BODY_SIZE) {
    throw httpError(413, "Content is too large.");
  }
}

/* =========================================
   GITHUB HELPERS
========================================= */

function getGitHubFileUrl(env) {
  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repo = encodeURIComponent(env.GITHUB_REPO);

  const path = env.CONTENT_PATH
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  return (
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}` +
    `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`
  );
}

function githubHeaders(env) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Al-Bardisi-Admin-Worker"
  };
}

async function getGitHubContent(env) {
  const response = await fetch(getGitHubFileUrl(env), {
    method: "GET",
    headers: githubHeaders(env)
  });

  if (!response.ok) {
    throw httpError(
      502,
      `Could not read GitHub content (HTTP ${response.status}).`
    );
  }

  const file = await response.json();

  if (
    !file ||
    typeof file.content !== "string" ||
    file.encoding !== "base64"
  ) {
    throw httpError(502, "Unexpected GitHub file format.");
  }

  const binary = atob(file.content.replace(/\s/g, ""));

  const bytes = Uint8Array.from(
    binary,
    character => character.charCodeAt(0)
  );

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw httpError(502, "content.json contains invalid JSON.");
  }
}

async function saveGitHubContent(data, env) {
  // Get the current SHA immediately before updating the file.
  const currentResponse = await fetch(getGitHubFileUrl(env), {
    method: "GET",
    headers: githubHeaders(env)
  });

  if (!currentResponse.ok) {
    throw httpError(
      502,
      `Could not get current file version (HTTP ${currentResponse.status}).`
    );
  }

  const currentFile = await currentResponse.json();

  if (!currentFile.sha) {
    throw httpError(502, "GitHub did not return a file SHA.");
  }

  const path = env.CONTENT_PATH
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");

  const owner = encodeURIComponent(env.GITHUB_OWNER);
  const repo = encodeURIComponent(env.GITHUB_REPO);

  const updateUrl =
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const content = JSON.stringify(data, null, 2);

  const bytes = new TextEncoder().encode(content);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64Content = btoa(binary);

  const updateResponse = await fetch(updateUrl, {
    method: "PUT",
    headers: {
      ...githubHeaders(env),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Update restaurant content from admin panel",
      content: base64Content,
      sha: currentFile.sha,
      branch: env.GITHUB_BRANCH
    })
  });

  if (!updateResponse.ok) {
    const status = updateResponse.status;

    if (status === 409 || status === 422) {
      throw httpError(
        409,
        "GitHub detected a file conflict. Reload the data and try again."
      );
    }

    throw httpError(
      502,
      `GitHub could not save the file (HTTP ${status}).`
    );
  }

  return true;
}
