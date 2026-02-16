# Public API Documentation

Base URL: `https://<your-domain>`

## Authentication

All endpoints require an API key via the `Authorization` header:

```
Authorization: ApiKey <PUBLIC_API_KEY>
```

---

## GET /api/funding-rounds

Returns all funding rounds with company data (incl. logo), investors (incl. logos), and post content — ready for display on the news website.

### Query Parameters

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `status` | `all`, `with_post`, `published` | `all` | Filter by post status |
| `since` | ISO date (e.g. `2026-01-01`) | — | Only rounds with articleDate >= since |

### Request

```bash
curl -X GET "https://<your-domain>/api/funding-rounds?status=published&since=2026-01-01" \
  -H "Authorization: ApiKey <PUBLIC_API_KEY>"
```

### Response `200 OK`

```json
{
  "data": [
    {
      "roundKey": "scyai_seed_42",
      "company": {
        "name": "ScyAI",
        "description": "AI-driven risk intelligence platform...",
        "logoUrl": "https://example.com/scyai-logo.png",
        "website": "https://scyai.com",
        "country": "Germany"
      },
      "funding": {
        "amountUsd": 5000000,
        "amountEur": 4650000,
        "stage": "Seed",
        "currency": "EUR"
      },
      "investors": [
        {
          "name": "Earlybird Venture Capital",
          "logoUrl": "https://example.com/earlybird-logo.png",
          "isLead": true
        },
        {
          "name": "Cherry Ventures",
          "logoUrl": "https://example.com/cherry-logo.png",
          "isLead": false
        }
      ],
      "articleDate": "2026-02-10T12:00:00.000Z",
      "sourceUrl": "https://techcrunch.com/2026/02/10/scyai-seed",
      "post": {
        "content": "ScyAI sichert sich 5 Mio. USD in einer Seed-Runde...",
        "publishedAt": "2026-02-10T14:30:00.000Z"
      }
    }
  ],
  "total": 1
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `roundKey` | `string` | Stable unique identifier |
| `company.name` | `string` | Company name |
| `company.description` | `string \| null` | Company description |
| `company.logoUrl` | `string \| null` | Company logo URL |
| `company.website` | `string \| null` | Company website |
| `company.country` | `string \| null` | Company country |
| `funding.amountUsd` | `number \| null` | Amount in USD |
| `funding.amountEur` | `number \| null` | Amount in EUR (converted) |
| `funding.stage` | `string \| null` | Pre-Seed, Seed, Series A–D, Growth, Late Stage, Debt, Grant |
| `funding.currency` | `string` | Always "EUR" |
| `investors[]` | `array` | Participating investors |
| `investors[].name` | `string` | Investor name |
| `investors[].logoUrl` | `string \| null` | Investor logo URL |
| `investors[].isLead` | `boolean` | Whether this investor is the lead |
| `articleDate` | `string \| null` | ISO 8601 source article date |
| `sourceUrl` | `string \| null` | URL of the source article |
| `post` | `object \| null` | Generated post (null if none exists) |
| `post.content` | `string` | Post text content |
| `post.publishedAt` | `string \| null` | ISO 8601 publish timestamp |
| `total` | `number` | Total number of results |

### Error Responses

| Status | Body | Description |
|--------|------|-------------|
| `401` | `{"error": "Invalid or missing API key"}` | Missing or wrong API key |
| `500` | `{"error": "API key not configured"}` | `PUBLIC_API_KEY` env var not set |
| `500` | `{"error": "Failed to fetch funding rounds"}` | Internal server error |
