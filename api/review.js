export default async function handler(req, res) {
  try {
    const upstream = await fetch("https://una-ai-tools-apis.una-oic.org/api/news_reviewer/review/", {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "ata_d96559789f111fffa039143dd65273d1d71a824f998e30b00a26a397",
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
      },
      body: req.method === "GET" ? undefined : JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
}

