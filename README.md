# Taggit

Taggit is a lightweight Chrome Extension that helps you tag, remember, and quickly find Reddit chat conversations.

Built for Manifest V3 with plain JavaScript, HTML, and CSS. No React, no build step, no backend, and no account required.

## Status

Version 1 is focused on a stable, useful MVP:

- Fast Reddit chat tagging
- Private local notes
- Filtering and quick lookup
- Chrome Side Panel support
- A simple foundation for future AI summaries

## Features

- Add color-coded tags to Reddit chat conversations
- Save short private notes for each conversation
- Update an existing tag instead of creating duplicates
- Filter saved chats by tag, username, or note
- Summarize the active Reddit chat with your own Gemini API key
- Open saved conversations directly from the sidebar
- Store data locally with `chrome.storage.local`
- Runs only on Reddit chat pages

## Install Locally

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `extension/` folder.
6. Open `https://www.reddit.com/chat/`.

## How To Use

1. Open Reddit Chat.
2. Click the **Tag** button beside a conversation.
3. Choose a color, enter a tag label, and optionally add a note.
4. Use the sidebar search field to filter saved conversations.
5. Paste a Gemini API key in **AI Summary** and click **Summarize** while Reddit Chat is the active tab.

If you save a tag for the same conversation again, Taggit updates the existing saved tag.

## Privacy

Taggit stores tags, notes, and your Gemini API key locally on your device using Chrome storage.

AI summaries are optional. When you click **Summarize**, visible chat text is sent directly from your browser to the Gemini API using your own API key.

## Architecture

```text
taggit/
  extension/
    manifest.json
    ai/
      summarize.js
    background/
      service-worker.js
    content/
      reddit-chat.js
    sidebar/
      sidebar.html
      sidebar.css
      sidebar.js
    utils/
      constants.js
      storage.js
  firebase/
  website/
  README.md
```

## Technical Notes

- Manifest V3 extension
- Chrome Side Panel API
- MutationObserver-first Reddit DOM injection
- No permanent DOM polling
- Shared storage utilities for consistent local data handling
- Conversation identity uses chat `href` first, username fallback second
- CSP-safe extension UI with no remote fonts or scripts
- Optional Gemini summaries via `generativelanguage.googleapis.com`

## Development

This project intentionally avoids a build system for now. Edit the files directly in `extension/`, then reload the unpacked extension in Chrome.
