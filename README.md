# Live Skeet

A stripped-back Bluesky client built for one job: posting a thread while
something is happening. Type, press Cmd or Ctrl and Enter, keep typing. Every
post continues the thread, and the composer never moves or loses focus.

Built on [`@bsky/sdk`](https://npmx.dev/package/@bsky/sdk) and `@atproto/lex`.

## Running it

```sh
bun install
bun dev
```

Then open http://localhost:3000.

## How it works

Everything runs in the browser. There is no backend, no API route, and nothing
is sent anywhere except your PDS, the Bluesky appview, and whichever AI provider
you configure for alt text.

- **Sign in.** Type your handle; the typeahead suggests accounts and the DID
  document is read to work out which PDS you are on, so self-hosted accounts
  work without any configuration. Sign in with an app password, created at
  Settings, then Privacy and security, then App passwords in the Bluesky app.
  Because there is no server, an app password is the only safe way to hold a
  session: it cannot change your email or password and can be revoked whenever
  you like. It is kept in this browser only.
- **Threads.** Start a new thread and the first post becomes the root, or paste
  the link to an existing post to carry on from there. Both `at://` URIs and
  `bsky.app/profile/.../post/...` links are accepted, and your existing replies
  in that thread are loaded from your repository. New posts normally continue
  from the tip, but you can pick any post in the thread and add the next one
  under that instead.
- **Posts on their own.** Some things deserve their own post rather than being
  buried in a thread. Switch the composer to "On its own" and it posts as a
  root. Those posts collect in a second lane beside the thread, kept in this
  browser so the session survives a reload. Below 780 pixels there is no room
  for two columns, so the lane picker in the composer switches the view as well. They are cleared with one button
  and nothing is removed from Bluesky.
- **Quotes.** Paste a post link into the composer and it becomes a quote rather
  than a bare URL, with media alongside it if you attach any. Every post in
  either lane has a one-click copy of its own `bsky.app` link, so quoting your
  own earlier post takes two actions.
- **Hashtags.** Tags you use are remembered and offered back as suggestions on
  later posts, since a live thread usually wants the same tag throughout. Tags
  can also be hidden: stored on the post record and indexed by Bluesky, but
  never shown in the text. Set them per post, or set them once in settings and
  they ride along on every post in the thread.
- **Sending.** The thread reads downwards and the composer sits at the bottom,
  directly under the newest post, so the next thing you write is always in the
  same place. Posts are queued in order, so each one lands as a reply to the
  last. The box is one line tall and grows downwards as you write. It clears
  the instant you press send, keeps the caret, and
  the network work happens behind it. The view follows the tail of the thread
  unless you have scrolled back up to read. Attachments are uploaded the moment
  they are added, so pressing send does not wait on them.
- **Media.** Paste, drop, or pick up to four images, or one video. Images are
  kept at full detail up to 2 MB and 4096 pixels on the long edge, and only
  re-encoded if they exceed that. Videos may be up to 300 MB and 10 minutes;
  size and length are checked before anything is uploaded, and the file goes
  through Bluesky's video service to be processed before the post goes out.
- **Alt text.** With a vision model configured, alt text is written in the
  background as soon as an image lands. Open any thumbnail to read or edit it.
  Posting without alt text is allowed, with a nudge you can turn off.
- **Engagement.** Likes, reposts, replies and quotes are re-read every 30
  seconds by default, and immediately when the window regains focus.

## Deploying

The app is a static export, so it needs no server:

```sh
bun run build   # writes ./out
```

On Cloudflare Pages, set the build command to `bun run build` and the output
directory to `out`. Any static host works the same way.

## Settings

Open with the cog, or Cmd/Ctrl and comma.

- Theme: follows the system by default, or force light or dark.
- Compact layout, for a narrow split-screen window next to a live stream.
- Post language tag, engagement refresh interval, alt text nudge, image
  shrinking.
- Alt text provider: OpenRouter with any model ID that accepts images, or any
  OpenAI-compatible endpoint. The language the alt text is written in is set
  here too.

API keys are stored in this browser only, and are sent straight to the provider
you choose.

## Keyboard

Press Cmd/Ctrl and `/` in the app for the full list.

Anywhere:

| Key | Action |
| --- | --- |
| Cmd/Ctrl + Enter | Send the post or reply |
| Cmd/Ctrl + ↑ / ↓ | Move up and down the current lane |
| Alt + Enter | Continue the thread under the selected post |
| Cmd/Ctrl + Shift + C | Copy the link to the selected post |
| Cmd/Ctrl + Shift + O | Write a post that is not part of the thread |
| Cmd/Ctrl + , | Settings |
| Cmd/Ctrl + / | Keyboard reference |
| Escape | Close a sheet, clear the selection, or leave the composer |

When the composer is not focused:

| Key | Action |
| --- | --- |
| J / ↓ | Down the thread, towards the newest post |
| K / ↑ | Up the thread, towards the start |
| Enter | Back to the composer |
| R | Continue the thread under the selected post |
| C | Copy the link to the selected post |
| O | Open the selected post on Bluesky |

## Design

Neutral throughout: blacks, greys and whites in both themes, with colour used
only where a state has to be noticed. Type is the system UI stack, nothing
loaded over the network. Icons are [Lucide](https://lucide.dev) (ISC licence).

Long threads use `content-visibility` so scrolling stays cheap however many
posts pile up, presses have a small physical response, and every animation is
transform and opacity only, disabled under `prefers-reduced-motion`. The layout
uses dynamic viewport units and safe-area insets, so it behaves on a phone with
the keyboard open and when installed to the home screen.
