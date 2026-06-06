import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "_site");
const site = {
  title: "Eric Li",
  email: "lizongxu65@gmail.com",
  url: "https://eric-statis.github.io",
};

const categories = [
  {
    title: "Deep Learning",
    slug: "deep-learning",
    description: "LLMs, neural networks, architectures, and technical evolution notes.",
  },
  {
    title: "Statistics & ML Theory",
    slug: "statistics-ml-theory",
    description: "Statistical learning, theory, uncertainty, and principled evaluation.",
  },
  {
    title: "Paper Reading",
    slug: "paper-reading",
    description: "Paper notes, summaries, and reading maps for new directions.",
  },
  {
    title: "Research Notes",
    slug: "research-notes",
    description: "Working notes, experiment logs, and Obsidian-to-blog drafts.",
  },
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

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

const posts = fs.readdirSync(path.join(root, "_posts"))
  .filter((file) => file.endsWith(".md"))
  .map((file) => {
    const [data, body] = parseFrontMatter(read(path.join("_posts", file)));
    const slug = file.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
    const postCategories = Array.isArray(data.categories) ? data.categories : [];
    return { ...data, categories: postCategories, body, slug, url: `/blog/${slug}/` };
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

function renderPostList(list) {
  if (!list.length) return "<p>No posts in this category yet.</p>";
  return list.map((post) => `<a href="${post.url}" class="publication-box-link">
  <div class="post-item">
    <div class="post-title"><span class="paper-link">${post.title}</span></div>
    <div class="post-meta">${formatDate(post.date)}${post.tags?.length ? ` · ${post.tags.join(", ")}` : ""}</div>
    <p>${post.summary || ""}</p>
  </div>
</a>`).join("\n\n");
}

const categoryCards = categories.map((category) => `<a class="blog-category-card" href="/blog/categories/${category.slug}/">
  <span class="blog-category-kicker">Category</span>
  <strong>${category.title}</strong>
  <span>${category.description}</span>
</a>`).join("\n");

const postList = posts.map((post) => `<a href="${post.url}" class="publication-box-link">
  <div class="post-item">
    <div class="post-title"><span class="paper-link">${post.title}</span></div>
    <div class="post-meta">${formatDate(post.date)}${post.tags?.length ? ` · ${post.tags.join(", ")}` : ""}</div>
    <p>${post.summary || ""}</p>
  </div>
</a>`).join("\n\n");

write("blog/index.html", shell({
  title: "Blog",
  description: "Research notes, paper reading logs, tutorials, and academic blog posts by Eric Li.",
  active: "blog",
  content: pageShell("Blog", `<div class="blog-category-grid">${categoryCards}</div>
<h2 class="title is-4 mt-6 mb-4">Recent Posts</h2>
<div class="publications-container">${postList}</div>`),
}));

for (const category of categories) {
  const categoryPosts = posts.filter((post) => post.categories.includes(category.title));
  write(`blog/categories/${category.slug}/index.html`, shell({
    title: category.title,
    description: `${category.title} posts by Eric Li.`,
    active: "blog",
    content: pageShell(category.title, `<p><a href="/blog/">← Back to Blog</a></p><div class="publications-container">${renderPostList(categoryPosts)}</div>`),
  }));
}

for (const post of posts) {
  const content = `<div class="section pt-5 page-hero-wall">
  <div class="container is-max-desktop px-5">
    <article class="content article-card" style="max-width: 90%; margin: 0 auto;">
      <h1 class="title is-2 mb-5">${post.title}</h1>
      <p class="subtitle">${formatDate(post.date)}${post.tags?.length ? ` · ${post.tags.join(", ")}` : ""}</p>
      ${markdownToHtml(post.body)}
    </article>
  </div>
</div>`;
  write(`blog/${post.slug}/index.html`, shell({
    title: post.title,
    description: post.summary,
    active: "blog",
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
${categories.map((category) => `  <url><loc>${site.url}/blog/categories/${category.slug}/</loc></url>`).join("\n")}
${posts.map((post) => `  <url><loc>${site.url}${post.url}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${posts.length} posts into ${out}`);
