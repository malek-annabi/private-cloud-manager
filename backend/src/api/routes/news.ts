import { Router } from "express";
import { z } from "zod";
import { auditMiddleware } from "../middleware/audit";
import { logger } from "../../core/logger";

const router = Router();

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

const CYBER_NEWS_FEEDS = [
  {
    name: "BleepingComputer",
    url: "https://www.bleepingcomputer.com/feed/",
  },
  {
    name: "Krebs on Security",
    url: "https://krebsonsecurity.com/feed/",
  },
  {
    name: "The Hacker News",
    url: "https://feeds.feedburner.com/TheHackersNews",
  },
  {
    name: "SecurityWeek",
    url: "https://www.securityweek.com/feed/",
  },
] as const;

type CyberNewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  description: string | null;
};

const CACHE_TTL_MS = 15 * 60 * 1000;

let cache:
  | {
      items: CyberNewsItem[];
      fetchedAt: string;
      expiresAt: number;
    }
  | null = null;

router.get("/cyber", auditMiddleware("LIST_CYBER_NEWS"), async (req, res) => {
  const parsed = querySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid news query" });
  }

  const limit = parsed.data.limit ?? 12;

  if (cache && cache.expiresAt > Date.now()) {
    return res.json({
      fetchedAt: cache.fetchedAt,
      sources: CYBER_NEWS_FEEDS.map((feed) => feed.name),
      items: cache.items.slice(0, limit),
    });
  }

  const settled = await Promise.allSettled(
    CYBER_NEWS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        headers: {
          "user-agent": "private-cloud-manager/1.0 (+local cyber news feed)",
        },
      });

      if (!response.ok) {
        throw new Error(`Feed responded with ${response.status}`);
      }

      const xml = await response.text();
      return parseRssItems(xml, feed.name);
    }),
  );

  const items = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    logger.warn(
      {
        feed: CYBER_NEWS_FEEDS[index]?.name,
        err: result.reason,
      },
      "Cyber news feed fetch failed",
    );

    return [];
  });

  const deduped = Array.from(
    new Map(
      items
        .sort(
          (left, right) =>
            new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime(),
        )
        .map((item) => [item.link, item]),
    ).values(),
  );

  cache = {
    items: deduped,
    fetchedAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return res.json({
    fetchedAt: cache.fetchedAt,
    sources: CYBER_NEWS_FEEDS.map((feed) => feed.name),
    items: cache.items.slice(0, limit),
  });
});

function parseRssItems(xml: string, fallbackSource: string): CyberNewsItem[] {
  const itemBlocks = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));

  return itemBlocks
    .map((match) => {
      const block = match[1];
      const title = decodeXml(extractTag(block, "title"));
      const link = decodeXml(extractTag(block, "link"));
      const pubDate = decodeXml(extractTag(block, "pubDate"));
      const source = decodeXml(extractTag(block, "source")) || fallbackSource;
      const description = sanitizeDescription(
        decodeXml(
          extractTag(block, "description") ||
            extractTag(block, "content:encoded") ||
            extractTag(block, "summary"),
        ),
      );

      if (!title || !link) {
        return null;
      }

      const publishedAt = normalizeDate(pubDate);

      return {
        title,
        link,
        source,
        publishedAt,
        description,
      } satisfies CyberNewsItem;
    })
    .filter((item): item is CyberNewsItem => Boolean(item));
}

function extractTag(block: string, tagName: string) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) {
    return "";
  }

  return stripCdata(match[1]).trim();
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function normalizeDate(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString();
  }

  return new Date(parsed).toISOString();
}

function sanitizeDescription(value: string) {
  const withoutHtml = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!withoutHtml) {
    return null;
  }

  return withoutHtml.length > 360 ? `${withoutHtml.slice(0, 357)}...` : withoutHtml;
}

export default router;
