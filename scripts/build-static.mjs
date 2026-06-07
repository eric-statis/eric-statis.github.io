import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const out = path.join(root, "_site");
const site = {
  title: "Eric Li",
  notesTitle: "Eric's Notes",
  email: "lizongxu65@gmail.com",
  url: "https://eric-statis.github.io",
};
const privatePassword = process.env.NOTES_PRIVATE_PASSWORD || "";
const privateKdfIterations = 210000;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function readJsonIfExists(file, fallback) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${error.message}`);
  }
}

const analyticsConfig = readJsonIfExists("analytics_config.json", {});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function write(file, content) {
  const target = path.join(out, file);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, content);
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return [{}, text];
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return [{}, text];
  const raw = text.slice(4, end).trim();
  const body = text.slice(end + 5);
  const data = {};
  for (const line of raw.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean);
    }
    data[key] = value;
  }
  return [data, body];
}

function liquidBasics(html) {
  return html
    .replaceAll("{{ '/' | absolute_url }}", `${site.url}/`)
    .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, "$1")
    .replace(/\{\{\s*'([^']+)'\s*\|\s*absolute_url\s*\}\}/g, `${site.url}$1`);
}

function inlineMarkdown(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function stripMarkdown(text) {
  return text
    .replace(/^---[\s\S]*?---/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`|[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(post, maxLength = 280) {
  const text = stripMarkdown(post.summary || post.body || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function estimateReadingTime(text) {
  const clean = stripMarkdown(text);
  const latinWords = clean.match(/[A-Za-z0-9]+/g)?.length || 0;
  const cjkChars = clean.match(/[\u4e00-\u9fff]/g)?.length || 0;
  const units = latinWords + Math.ceil(cjkChars / 2);
  return Math.max(1, Math.ceil(units / 220));
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[char]));
}

function analyticsSnippet() {
  const token = process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || analyticsConfig.cloudflareWebAnalyticsToken || "";
  if (!token) return "";
  const beacon = JSON.stringify({ token });
  return `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${escapeHtml(beacon)}'></script>\n`;
}

function isPrivateValue(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function base64(buffer) {
  return Buffer.from(buffer).toString("base64");
}

function encryptPrivateHtml(html, slug) {
  if (!privatePassword) {
    throw new Error(`Post "${slug}" is private. Set NOTES_PRIVATE_PASSWORD before building.`);
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(privatePassword, salt, privateKdfIterations, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    data: base64(Buffer.concat([encrypted, tag])),
    iv: base64(iv),
    salt: base64(salt),
    iterations: privateKdfIterations,
  };
}

function isTableDivider(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTable(lines, start) {
  const headerLine = lines[start];
  const dividerLine = lines[start + 1];
  if (!headerLine?.includes("|") || !isTableDivider(dividerLine || "")) return null;

  const rows = [];
  let idx = start + 2;
  while (idx < lines.length && lines[idx].includes("|") && lines[idx].trim()) {
    rows.push(lines[idx]);
    idx += 1;
  }

  const splitRow = (line) => line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => inlineMarkdown(cell.trim()));

  const headers = splitRow(headerLine);
  const bodyRows = rows.map(splitRow);
  const thead = `<thead><tr>${headers.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;

  return {
    html: `<div class="table-container"><table class="table is-striped is-hoverable is-fullwidth">${thead}${tbody}</table></div>`,
    next: idx,
  };
}

function markdownToHtml(markdown) {
  const lines = markdown.trim().split("\n");
  const blocks = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  }

  function flushQuote() {
    if (quote.length) {
      blocks.push(`<blockquote>${quote.map((item) => `<p>${inlineMarkdown(item)}</p>`).join("")}</blockquote>`);
      quote = [];
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }
    const table = parseTable(lines, i);
    if (table) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(table.html);
      i = table.next - 1;
      continue;
    }
    if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push("<hr>");
      continue;
    }
    if (/^>\s?/.test(line.trim())) {
      flushParagraph();
      flushList();
      quote.push(line.trim().replace(/^>\s?/, ""));
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      flushParagraph();
      flushQuote();
      list.push(line.trim().replace(/^[-*]\s+/, ""));
      continue;
    }
    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h3>${inlineMarkdown(line.slice(4).trim())}</h3>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h2>${inlineMarkdown(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      flushQuote();
      blocks.push(`<h1>${inlineMarkdown(line.slice(2).trim())}</h1>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushQuote();
  return blocks.join("\n\n");
}

function formatDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function nav(active) {
  return `
  <nav class="navbar is-light" role="navigation" aria-label="main navigation">
    <div class="container" style="max-width: 900px; margin: 0 auto;">
      <div class="navbar-brand">
        <a class="navbar-item" href="/"><strong>${site.title}</strong></a>
        <a role="button" class="navbar-burger" aria-label="menu" aria-expanded="false" data-target="navbarMenu">
          <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
        </a>
      </div>
      <div id="navbarMenu" class="navbar-menu">
        <div class="navbar-end">
          <a class="navbar-item ${active === "about" ? "is-active" : ""}" href="/">About</a>
          <a class="navbar-item ${active === "publications" ? "is-active" : ""}" href="/publications/">Publications</a>
          <a class="navbar-item ${active === "blog" ? "is-active" : ""}" href="/blog/">Blog</a>
          <a class="navbar-item ${active === "notes" ? "is-active" : ""}" href="/notes/">Notes</a>
        </div>
      </div>
    </div>
  </nav>`;
}

function shell({ title, description, active, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} - ` : ""}${site.title} | Academic Homepage</title>
  <meta name="description" content="${description || ""}">
  <meta name="author" content="${site.title}">
  <meta name="robots" content="index, follow">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css">
  <link rel="stylesheet" href="/assets/css/main.css">
  <script defer src="https://use.fontawesome.com/releases/v5.15.4/js/all.js"></script>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['\\\\(', '\\\\)']],
        displayMath: [['\\\\[', '\\\\]']]
      },
      svg: { fontCache: 'global' }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head>
<body>
${nav(active)}
<main>
${content}
</main>
<footer class="footer">
  <div class="container" style="max-width: 900px; margin: 0 auto;">
    <div class="content has-text-centered">
      <p>© 2026 ${site.title}. Created & maintained with Jekyll and Bulma.<br>
      The website content is licensed <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY NC SA 4.0</a>.</p>
    </div>
  </div>
</footer>
<script src="/assets/js/main.js"></script>
${analyticsSnippet()}
</body>
</html>`;
}

function notesNav(active = "posts") {
  const item = (key, href, label) => `<li><a href="${href}" class="${active === key ? "active" : ""}">${label}</a></li>`;
  return `<header class="notes-header" id="top">
  <nav class="notes-nav">
    <div class="notes-logo">
      <a href="/notes/" title="${site.notesTitle}">${site.notesTitle}</a>
      <button id="notes-theme-toggle" type="button" title="Toggle theme" aria-label="Toggle theme">
        <span class="notes-moon">☾</span><span class="notes-sun">☀</span>
      </button>
    </div>
    <ul class="notes-menu">
      ${item("posts", "/notes/", "Posts")}
      ${item("archive", "/notes/archives/", "Archive")}
      ${item("collections", "/notes/collections/", "Collections")}
      ${item("search", "/notes/search/", "Search")}
      ${item("tags", "/notes/tags/", "Tags")}
      ${item("home", "/", "Home")}
    </ul>
  </nav>
</header>`;
}

function notesShell({ title, description, active, content }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title ? `${title} - ` : ""}${site.notesTitle}</title>
  <meta name="description" content="${description || "Research notes by Eric Li."}">
  <meta name="author" content="${site.title}">
  <meta name="robots" content="index, follow">
  <link rel="stylesheet" href="/assets/css/main.css">
  <link rel="stylesheet" href="/assets/css/notes.css?v=20260608-1">
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
        displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
        processEscapes: true
      },
      svg: { fontCache: 'global' }
    };
  </script>
  <script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
</head>
<body class="notes-site">
<script>
  if (localStorage.getItem("notes-theme") === "dark" || (!localStorage.getItem("notes-theme") && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.body.classList.add("dark");
  }
</script>
${notesNav(active)}
<main class="notes-main">
${content}
</main>
<footer class="notes-footer">
  <span>© 2026 <a href="/notes/">${site.notesTitle}</a></span>
  <span>Built as a minimal research notebook.</span>
</footer>
<a href="#top" class="notes-top-link" aria-label="Go to top">▲</a>
<script src="/assets/js/main.js"></script>
${analyticsSnippet()}
</body>
</html>`;
}

function pageShell(title, body) {
  return `<div class="section pt-5 page-hero-wall">
  <div class="container is-max-desktop px-5">
    <div class="content" style="max-width: 90%; margin: 0 auto;">
      <h1 class="title is-2 mb-5">${title}</h1>
      ${body}
    </div>
  </div>
</div>`;
}

fs.rmSync(out, { recursive: true, force: true });
ensureDir(out);
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

const [homeData, homeBody] = parseFrontMatter(read("index.md"));
write("index.html", shell({
  title: "",
  description: homeData.description,
  active: "about",
  content: liquidBasics(homeBody),
}));

const [pubData, pubBody] = parseFrontMatter(read("publications.md"));
write("publications/index.html", shell({
  title: pubData.title,
  description: pubData.description,
  active: "publications",
  content: pageShell(pubData.title, liquidBasics(pubBody)),
}));

const postSources = [
  { dir: "_posts", defaultPrivate: false },
  { dir: "_private_posts", defaultPrivate: true },
];

const posts = postSources.flatMap((source) => {
  const sourceDir = path.join(root, source.dir);
  if (!fs.existsSync(sourceDir)) return [];
  return fs.readdirSync(sourceDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const [data, body] = parseFrontMatter(read(path.join(source.dir, file)));
      const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
      const categories = Array.isArray(data.categories) ? data.categories : [];
      const tags = Array.isArray(data.tags) ? data.tags : [];
      const isPrivate = source.defaultPrivate || isPrivateValue(data.private);
      return { ...data, categories, tags, private: isPrivate, body, slug, notesUrl: `/notes/posts/${slug}/` };
    });
})
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const collections = readJsonIfExists("notes_collections.json", []);
const collectionTypes = [
  {
    key: "papers",
    title: "Papers",
    description: "Papers, surveys, working papers, and technical reports.",
  },
  {
    key: "posts-blogs",
    title: "Posts & Blogs",
    description: "External blog posts, technical essays, and research notes.",
  },
  {
    key: "ideas-opinions",
    title: "Ideas & Opinions",
    description: "Opinions, debates, research perspectives, and conceptual prompts.",
  },
  {
    key: "talks-lectures",
    title: "Talks & Lectures",
    description: "Talks, lectures, course videos, slides, and seminar materials.",
  },
  {
    key: "tools-code",
    title: "Tools & Code",
    description: "Code repositories, software tools, implementations, and demos.",
  },
  {
    key: "datasets-benchmarks",
    title: "Datasets & Benchmarks",
    description: "Datasets, benchmarks, leaderboards, and evaluation resources.",
  },
];

function postMeta(post) {
  return `Date: ${formatDate(post.date)} | Estimated Reading Time: ${estimateReadingTime(post.body)} min | Author: Eric Li`;
}

function postCard(post) {
  return `<article class="notes-post-entry${post.private ? " is-private" : ""}">
  <a class="notes-entry-link" href="${post.notesUrl}" aria-label="Read ${escapeHtml(post.title)}"></a>
  <header class="notes-entry-header"><h2>${post.private ? '<span class="notes-lock">Private</span>' : ""}${escapeHtml(post.title)}</h2></header>
  <section class="notes-entry-content"><p>${escapeHtml(excerpt(post))}</p></section>
  <footer class="notes-entry-footer">${postMeta(post)}</footer>
</article>`;
}

function privatePostArticle(post) {
  const encrypted = encryptPrivateHtml(markdownToHtml(post.body), post.slug);
  return `<article class="notes-article notes-private-article">
  <header class="notes-post-header">
    <h1>${escapeHtml(post.title)}</h1>
    <p>${postMeta(post)}</p>
  </header>
  <section class="notes-private-gate">
    <span class="notes-private-badge">Private note</span>
    <h2>Password required</h2>
    <p>This note is encrypted in the static build. Enter the password to unlock it in your browser.</p>
    <form class="notes-private-form" data-private-form>
      <input type="password" name="password" autocomplete="current-password" placeholder="Password" required>
      <button type="submit">Unlock</button>
    </form>
    <p class="notes-private-error" data-private-error hidden>Wrong password. Please try again.</p>
  </section>
  <section class="notes-article-content notes-private-content" data-private-content hidden></section>
  <script type="application/json" data-private-payload>${JSON.stringify(encrypted)}</script>
  <script>
  (() => {
    const form = document.querySelector("[data-private-form]");
    const error = document.querySelector("[data-private-error]");
    const content = document.querySelector("[data-private-content]");
    const gate = document.querySelector(".notes-private-gate");
    const payload = JSON.parse(document.querySelector("[data-private-payload]").textContent);
    const bytes = (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.hidden = true;
      const password = new FormData(form).get("password");
      try {
        const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
        const key = await crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: bytes(payload.salt), iterations: payload.iterations, hash: "SHA-256" },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"]
        );
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(payload.iv) }, key, bytes(payload.data));
        content.innerHTML = new TextDecoder().decode(decrypted);
        content.hidden = false;
        gate.hidden = true;
        if (window.MathJax?.typesetPromise) window.MathJax.typesetPromise([content]);
      } catch {
        error.hidden = false;
      }
    });
  })();
  </script>
</article>`;
}

function collectionItemsFor(type) {
  const group = collections.find((section) => section.type === type.key || slugify(section.section || section.title || "") === type.key);
  return Array.isArray(group?.items) ? group.items : [];
}

write("blog/index.html", shell({
  title: "Blog",
  description: "Blog posts by Eric Li.",
  active: "blog",
  content: pageShell("Blog", `<p>Blog posts will be added later. Research notes now live in <a href="/notes/">Notes</a>.</p>`),
}));

const topicMap = posts.reduce((acc, post) => {
  const topics = post.categories.length ? post.categories : ["Uncategorized"];
  for (const topic of topics) {
    acc[topic] ||= [];
    acc[topic].push(post);
  }
  return acc;
}, {});
const topicList = Object.entries(topicMap).sort((a, b) => a[0].localeCompare(b[0]));

write("notes/index.html", notesShell({
  title: "",
  description: "Eric Li's research notes on statistics, machine learning theory, and large language models.",
  active: "posts",
  content: `<article class="notes-home-info">
  <div>
    <div class="notes-hero-stickers" aria-hidden="true">
      <span>📚</span><span>🧠</span><span>☕</span><span>✨</span>
    </div>
    <header class="notes-entry-header"><h1>Welcome to Eric's Notes</h1></header>
    <section class="notes-entry-content">
      <p>I document research notes on statistics, machine learning theory, large language models, reinforcement learning, causal inference, and off-policy evaluation.</p>
    </section>
    <footer class="notes-social-icons">
      <a href="mailto:${site.email}" title="Email">Email</a>
      <a href="https://github.com/eric-statis" target="_blank" rel="noopener noreferrer" title="GitHub">GitHub</a>
      <a href="https://orcid.org/0009-0007-1129-5202" target="_blank" rel="noopener noreferrer" title="ORCID">ORCID</a>
    </footer>
  </div>
</article>
<section class="notes-card-grid notes-topic-grid">
${topicList.map(([topic, topicPosts]) => {
  const latest = topicPosts.reduce((current, post) => String(post.date) > String(current.date) ? post : current, topicPosts[0]);
  return `<article class="notes-entry-card">
  <a class="notes-entry-link" href="/notes/topics/${slugify(topic)}/" aria-label="Open ${escapeHtml(topic)}"></a>
  <h2>${escapeHtml(topic)}</h2>
  <span>Updated ${formatDate(latest.date)}</span>
</article>`;
}).join("\n")}
</section>`,
}));

for (const [topic, topicPosts] of topicList) {
  write(`notes/topics/${slugify(topic)}/index.html`, notesShell({
    title: topic,
    description: `${topic} notes by Eric Li.`,
    active: "posts",
    content: `<section class="notes-page-header">
  <h1>${escapeHtml(topic)}</h1>
  <p><a href="/notes/">← All topics</a></p>
</section>
${topicPosts.map(postCard).join("\n\n")}`,
  }));
}

const postsByYear = posts.reduce((acc, post) => {
  const year = String(post.date).slice(0, 4);
  acc[year] ||= [];
  acc[year].push(post);
  return acc;
}, {});

write("notes/archives/index.html", notesShell({
  title: "Archive",
  description: "Archive of Eric Li's research notes.",
  active: "archive",
  content: `<section class="notes-page-header"><h1>Archive</h1></section>
${Object.entries(postsByYear).sort((a, b) => b[0].localeCompare(a[0])).map(([year, yearPosts]) => `<section class="notes-archive-year">
  <h2>${year}</h2>
  ${yearPosts.map((post) => `<a class="notes-archive-item" href="${post.notesUrl}"><span>${formatDate(post.date)}</span><strong>${post.title}</strong></a>`).join("\n")}
</section>`).join("\n")}`,
}));

const tagMap = posts.reduce((acc, post) => {
  for (const tag of post.tags) {
    acc[tag] ||= [];
    acc[tag].push(post);
  }
  return acc;
}, {});

write("notes/collections/index.html", notesShell({
  title: "Collections",
  description: "Curated external materials, papers, tutorials, and references saved by Eric Li.",
  active: "collections",
  content: `<section class="notes-page-header">
  <h1>Collections</h1>
  <p>Curated external materials, papers, tutorials, and references worth revisiting.</p>
</section>
<section class="notes-card-grid notes-collection-grid">
${collectionTypes.map((type) => {
  const items = collectionItemsFor(type);
  return `<article class="notes-entry-card">
  <a class="notes-entry-link" href="/notes/collections/${type.key}/" aria-label="Open ${escapeHtml(type.title)}"></a>
  <h2>${escapeHtml(type.title)}</h2>
  <p>${escapeHtml(type.description)}</p>
</article>`;
}).join("\n")}
</section>`,
}));

for (const type of collectionTypes) {
  const items = collectionItemsFor(type);
  write(`notes/collections/${type.key}/index.html`, notesShell({
    title: type.title,
    description: type.description,
    active: "collections",
    content: `<section class="notes-page-header">
  <h1>${escapeHtml(type.title)}</h1>
  <p><a href="/notes/collections/">← All collections</a></p>
</section>
${items.length ? `<div class="notes-resource-list">
${items.map((item) => {
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const meta = [item.source, item.added].filter(Boolean).map(escapeHtml).join(" · ");
  return `<article class="notes-resource-item">
    <h3><a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "Untitled resource")}</a></h3>
    ${meta ? `<p class="notes-resource-meta">${meta}</p>` : ""}
    ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
    ${tags.length ? `<div class="notes-resource-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
  </article>`;
}).join("\n")}
  </div>` : `<p class="notes-empty-state">No saved resources yet.</p>`}`,
  }));
}

const tagList = Object.entries(tagMap).sort((a, b) => a[0].localeCompare(b[0]));
write("notes/tags/index.html", notesShell({
  title: "Tags",
  description: "Tags for Eric Li's research notes.",
  active: "tags",
  content: `<section class="notes-page-header"><h1>Tags</h1></section>
<div class="notes-tags-cloud">
${tagList.map(([tag, tagPosts]) => `<a href="/notes/tags/${slugify(tag)}/">${tag}<sup>${tagPosts.length}</sup></a>`).join("\n")}
</div>`,
}));

for (const [tag, tagPosts] of tagList) {
  write(`notes/tags/${slugify(tag)}/index.html`, notesShell({
    title: tag,
    description: `${tag} notes by Eric Li.`,
    active: "tags",
    content: `<section class="notes-page-header"><h1>${tag}</h1><p><a href="/notes/tags/">← All tags</a></p></section>
${tagPosts.map(postCard).join("\n\n")}`,
  }));
}

const searchIndex = JSON.stringify(posts.map((post) => ({
  title: post.title,
  url: post.notesUrl,
  date: formatDate(post.date),
  readingTime: estimateReadingTime(post.body),
  categories: post.categories,
  tags: post.tags,
  text: stripMarkdown(`${post.title} ${post.summary || ""} ${post.private ? "" : post.body}`).slice(0, 1200),
})));

write("notes/search/index.html", notesShell({
  title: "Search",
  description: "Search Eric Li's research notes.",
  active: "search",
  content: `<section class="notes-page-header"><h1>Search</h1></section>
<div class="notes-search-box">
  <input id="notes-search-input" type="search" placeholder="Search notes..." autocomplete="off">
</div>
<div id="notes-search-results" class="notes-search-results"></div>
<script>
const notesSearchIndex = ${searchIndex};
const input = document.getElementById("notes-search-input");
const results = document.getElementById("notes-search-results");
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}
function renderResults(query) {
  const q = query.trim().toLowerCase();
  const matches = q ? notesSearchIndex.filter((item) => [item.title, item.text, item.categories.join(" "), item.tags.join(" ")].join(" ").toLowerCase().includes(q)) : notesSearchIndex;
  results.innerHTML = matches.map((item) => '<article class="notes-post-entry"><a class="notes-entry-link" href="' + escapeHtml(item.url) + '" aria-label="Read ' + escapeHtml(item.title) + '"></a><header class="notes-entry-header"><h2>' + escapeHtml(item.title) + '</h2></header><section class="notes-entry-content"><p>' + escapeHtml(item.text.slice(0, 220)) + '...</p></section><footer class="notes-entry-footer">Date: ' + escapeHtml(item.date) + ' | Estimated Reading Time: ' + escapeHtml(item.readingTime) + ' min | Author: Eric Li</footer></article>').join("");
}
input.addEventListener("input", (event) => renderResults(event.target.value));
renderResults("");
</script>`,
}));

for (const post of posts) {
  if (post.private) {
    write(`notes/posts/${post.slug}/index.html`, notesShell({
      title: post.title,
      description: post.summary,
      active: "posts",
      content: privatePostArticle(post),
    }));
    continue;
  }
  const content = `<article class="notes-article">
  <header class="notes-post-header">
    <h1>${post.title}</h1>
    <p>${postMeta(post)}</p>
  </header>
  <section class="notes-article-content">
    ${markdownToHtml(post.body)}
  </section>
</article>`;
  write(`notes/posts/${post.slug}/index.html`, notesShell({
    title: post.title,
    description: post.summary,
    active: "posts",
    content,
  }));
}

write("robots.txt", `User-agent: *
Allow: /

Sitemap: ${site.url}/sitemap.xml
`);

write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${site.url}/</loc></url>
  <url><loc>${site.url}/publications/</loc></url>
  <url><loc>${site.url}/blog/</loc></url>
  <url><loc>${site.url}/notes/</loc></url>
  <url><loc>${site.url}/notes/archives/</loc></url>
  <url><loc>${site.url}/notes/collections/</loc></url>
  <url><loc>${site.url}/notes/search/</loc></url>
  <url><loc>${site.url}/notes/tags/</loc></url>
${topicList.map(([topic]) => `  <url><loc>${site.url}/notes/topics/${slugify(topic)}/</loc></url>`).join("\n")}
${collectionTypes.map((type) => `  <url><loc>${site.url}/notes/collections/${type.key}/</loc></url>`).join("\n")}
${posts.map((post) => `  <url><loc>${site.url}${post.notesUrl}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${posts.length} posts into ${out}`);
