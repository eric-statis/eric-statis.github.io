# Eric Li Academic Homepage

This is a Jekyll academic homepage with a Markdown blog. It is designed for GitHub Pages and for publishing selected notes from Obsidian.

## Local Preview

The easiest local preview path does not require Ruby/Jekyll:

```bash
node scripts/build-static.mjs
python3 -m http.server 8000 --directory _site
```

Then open:

```text
http://localhost:8000/
```

For a true Jekyll preview, install dependencies once:

```bash
bundle install
```

Run the Jekyll site:

```bash
bundle exec jekyll serve
```

Then open:

```text
http://localhost:4000/
```

On older macOS Ruby installations, `bundle install` may require Xcode Command Line Tools or a newer Ruby. The static preview path above avoids that.

## Write Blog Posts

Add Markdown posts to `_posts/` using this filename format:

```text
YYYY-MM-DD-post-slug.md
```

Each post should start with front matter:

```markdown
---
layout: post
title: "Notes on RLHF and Statistical Evaluation"
date: 2026-06-06
categories: [Statistics & ML Theory]
tags: [LLM, RLHF, Statistics, OPE]
summary: "A short note on how statistical evaluation can help RLHF."
---

Your post content here.
```

The Blog page at `/blog/` updates automatically from `_posts/`.

Current blog categories:

- `Deep Learning`
- `Statistics & ML Theory`
- `Paper Reading`
- `Research Notes`

Use one of these in `categories: [...]` to make the post appear on a category page.

## Publish From Obsidian

Keep private notes in Obsidian. Only publish selected notes.

Recommended workflow:

1. Write freely in Obsidian.
2. Clean one note for public reading.
3. Convert Obsidian wikilinks such as `[[Note]]` into normal Markdown links.
4. Put images under `assets/images/blog/`.
5. Run `scripts/publish-note.sh /path/to/note.md optional-slug`.

Example:

```bash
scripts/publish-note.sh "/Users/lixiansheng/Obsidian/Publish/Blog/RLHF Notes.md" rlhf-notes
```

## Deploy

Create a GitHub repository named:

```text
eric-statis.github.io
```

Build the static site into `docs/`:

```bash
npm run build:docs
```

Push these files to the repository root. In GitHub, open:

```text
Settings → Pages
```

Use:

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

GitHub Pages will publish the prebuilt static site from `docs/`.

## Real Visitor Analytics

This site supports two analytics layers:

- Cloudflare Web Analytics for private dashboard analytics.
- GoatCounter for public homepage counters.

Cloudflare is lightweight, works on GitHub Pages, and shows aggregate visits, pages, referrers, devices, and countries in the Cloudflare dashboard.

1. Open Cloudflare Dashboard → Analytics & Logs → Web Analytics.
2. Add `eric-statis.github.io` as a site and copy the Web Analytics token.
3. Either create a local ignored file named `analytics_config.json`:

```json
{
  "cloudflareWebAnalyticsToken": "your-token"
}
```

Or build with an environment variable:

```bash
CLOUDFLARE_WEB_ANALYTICS_TOKEN="your-token" npm run build:docs
```

4. Commit and push the regenerated `docs/` folder.

The token appears in the published HTML by design; it identifies the website to Cloudflare but does not expose visitor identities. Analytics services show aggregate traffic, not the real names of visitors.

To show live counters on the homepage:

1. Create a GoatCounter site at `https://www.goatcounter.com/`.
2. Enable public visitor counters in GoatCounter's site settings.
3. Add the GoatCounter code to your local ignored `analytics_config.json`:

```json
{
  "cloudflareWebAnalyticsToken": "your-cloudflare-token",
  "goatCounterCode": "your-goatcounter-subdomain"
}
```

If your GoatCounter URL is `https://eric-statis.goatcounter.com/`, then the code is:

```text
eric-statis
```

4. Run `npm run build:docs`, commit, and push.

The homepage will then show total views and homepage views. GoatCounter still reports anonymous counts, not visitor names.

## Visitor Map

The homepage `Visitors` section uses a local SVG map so the page remains stable even if third-party map widgets fail. Real visitor data is collected separately through Cloudflare Web Analytics when a token is configured.
