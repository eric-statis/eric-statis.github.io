# Obsidian Publishing Staging Area

Use this folder as a temporary staging area for notes you want to publish.

Suggested Obsidian workflow:

1. Copy a finished note from your vault into this folder.
2. Remove private comments, unfinished claims, and broken references.
3. Add or check front matter.
4. Move it into `_posts/` manually, or run `scripts/publish-note.sh`.

Obsidian syntax to check before publishing:

```markdown
[[Internal wikilink]]
![[Embedded image.png]]
#inline-tag
```

Convert those to web-friendly Markdown:

```markdown
[Internal wikilink](/blog/post-slug/)
![Embedded image](/assets/images/blog/embedded-image.png)
```
