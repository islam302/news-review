export default async function handler(req, res) {
  try {
    const upstream = await fetch("http://62.72.22.223/news_reviewer/api/review/", {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "nra_abeffba708601616e0a1ecd9f93387e0db8d7d3a19aa3d513fc9b849",
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

