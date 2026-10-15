import { decodeBasicEntities } from './text.js';
import { safeXUrl, safeYouTubeUrl } from './safe-url.js';

function link(doc, href, className, label) {
  const anchor = doc.createElement('a');
  if (className) anchor.className = className;
  anchor.textContent = label;
  anchor.setAttribute('href', href);
  anchor.setAttribute('target', '_blank');
  anchor.setAttribute('rel', 'noopener noreferrer');
  return anchor;
}

export function renderTweet(doc, tweet) {
  const userName = String(tweet?.userName ?? '');
  const text = decodeBasicEntities(tweet?.text ?? '');
  const root = doc.createElement('div');
  root.className = 'tweet-item';
  root.setAttribute('data-username', userName);
  root.setAttribute('data-text', text);
  if (tweet?.dateIso) root.setAttribute('data-date', String(tweet.dateIso));

  const heading = doc.createElement('h3');
  const href = safeXUrl(tweet?.tweetUrl);
  const label = `@${userName}`;
  if (href) {
    heading.appendChild(link(doc, href, '', label));
  } else {
    const span = doc.createElement('span');
    span.textContent = label;
    heading.appendChild(span);
  }
  root.appendChild(heading);

  const date = doc.createElement('p');
  date.className = 'date';
  date.textContent = String(tweet?.dateLabel ?? '');
  root.appendChild(date);

  const body = doc.createElement('p');
  body.className = 'tweet-text';
  body.textContent = text;
  root.appendChild(body);

  if (href) root.appendChild(link(doc, href, 'tweet-link', 'Xで見る'));
  return root;
}

export function renderVideo(doc, video) {
  const title = decodeBasicEntities(video?.title ?? '');
  const description = decodeBasicEntities(video?.description ?? '');
  const root = doc.createElement('div');
  root.className = 'video-item';
  root.setAttribute('data-title', title);
  root.setAttribute('data-description', description);
  if (video?.publishedAt) root.setAttribute('data-date', String(video.publishedAt));

  const heading = doc.createElement('h3');
  const href = safeYouTubeUrl(video?.url);
  if (href) {
    heading.appendChild(link(doc, href, '', title));
  } else {
    const span = doc.createElement('span');
    span.textContent = title;
    heading.appendChild(span);
  }
  root.appendChild(heading);

  const date = doc.createElement('p');
  date.className = 'date';
  date.textContent = String(video?.dateLabel ?? '');
  root.appendChild(date);

  const body = doc.createElement('p');
  body.className = 'description';
  body.textContent = description;
  root.appendChild(body);

  if (href) root.appendChild(link(doc, href, 'video-link', 'Youtubeで見る'));
  return root;
}
