const TWITTER_EPOCH = 1288834974657;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

const MONTHS = {
  January: 0,
  February: 1,
  March: 2,
  April: 3,
  May: 4,
  June: 5,
  July: 6,
  August: 7,
  September: 8,
  October: 9,
  November: 10,
  December: 11,
};

export function snowflakeToDate(snowflakeId) {
  const id = BigInt(snowflakeId);
  const timestamp = Number(id >> 22n) + TWITTER_EPOCH;
  return new Date(timestamp);
}

export function formatJaDate(date) {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

// "November 7, 2025 at 12:21AM" as stored in YouTube-data.txt.
export function parseCustomDate(dateString) {
  if (typeof dateString !== 'string') return null;
  const parts = dateString.match(/(\w+)\s+(\d+),\s+(\d+)\s+at\s+(\d+):(\d+)(AM|PM)/);
  if (!parts || MONTHS[parts[1]] == null) return null;
  const day = parseInt(parts[2], 10);
  const year = parseInt(parts[3], 10);
  let hour = parseInt(parts[4], 10);
  const minute = parseInt(parts[5], 10);
  if (parts[6] === 'PM' && hour !== 12) hour += 12;
  if (parts[6] === 'AM' && hour === 12) hour = 0;
  return new Date(year, MONTHS[parts[1]], day, hour, minute);
}

export function formatVideoDate(dateObj) {
  if (!dateObj) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  const hour = String(dateObj.getHours()).padStart(2, '0');
  const minute = String(dateObj.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hour}:${minute}`;
}

export function sortNewest(items, getDate) {
  return items.slice().sort((a, b) => {
    const dateA = getDate(a);
    const dateB = getDate(b);
    const timeA = dateA instanceof Date && !Number.isNaN(dateA.getTime()) ? dateA.getTime() : 0;
    const timeB = dateB instanceof Date && !Number.isNaN(dateB.getTime()) ? dateB.getTime() : 0;
    return timeB - timeA;
  });
}

// Mirrors the X page: search shows every match; otherwise the newest day
// plus the previous day, then one week further each time the button is used.
export function filterFeed(items, { searchQuery = '', weeksToShow = 0, mostRecentDate }) {
  const query = String(searchQuery).trim().toLowerCase();
  if (query) {
    return {
      visible: items.map((item) => `${item.username} ${item.text}`.toLowerCase().includes(query)),
      hasMore: false,
    };
  }

  const anchor = mostRecentDate instanceof Date ? mostRecentDate : new Date(mostRecentDate);
  const dayStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const cutoff = weeksToShow === 0
    ? new Date(dayStart.getTime() - ONE_DAY_MS)
    : new Date(dayStart.getTime() - (weeksToShow * ONE_WEEK_MS));

  let hasMore = false;
  const visible = items.map((item) => {
    const date = item.date instanceof Date ? item.date : new Date(item.date);
    if (date >= cutoff) return true;
    hasMore = true;
    return false;
  });
  return { visible, hasMore };
}

export function videoMatches(item, searchQuery) {
  const query = String(searchQuery ?? '').trim().toLowerCase();
  if (!query) return true;
  return `${item.title} ${item.description}`.toLowerCase().includes(query);
}
