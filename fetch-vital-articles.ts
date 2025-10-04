const fs = require("fs");

const query = async (category: string) => {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.append("action", "query");
  url.searchParams.append("cmlimit", "500");
  url.searchParams.append("cmtitle", category);
  url.searchParams.append("format", "json");
  url.searchParams.append("list", "categorymembers");
  url.searchParams.append("origin", "*");
  const data = await (await fetch(url.toString())).json();
  try {
    return data.query.categorymembers;
  } catch {
    throw Error(category);
  }
};

(async () => {
  const levels: Record<string, string[]>[] = [];
  for (let i = 1; i <= 5; ++i) {
    const level = {};
    for (const { ns, title: topic } of await query(
      `Category:Wikipedia_level-${i}_vital_articles_by_topic`,
    )) {
      if (ns !== 14) {
        continue;
      }
      level[topic.split(" vital articles in ")[1]] = (await query(topic))
        .map(member => member.title.replace(/^Talk:/, ""))
        .sort();
    }
    levels.push(level);
  }
  fs.writeFileSync("vital-articles.json", JSON.stringify(levels));
})();
