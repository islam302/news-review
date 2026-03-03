export default async function handler(req, res) {
  try {
    const upstream = await fetch("https://una-ai-tools-apis.una-oic.org/api/news_reviewer/review/", {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "nra_ce35c0f17f8ab7e1446eb14af61baf247e17aca000693b4ee4a0984e",
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

