const randomElement = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const generateQuestion = async (topic: string, answer: string) => {
  // Normalize answer
  const rawAnswer = answer;
  answer = answer.replace(/ *\([^)]*\)/g, "");

  // Fetch article text
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.append("action", "query");
  url.searchParams.append("explaintext", "true");
  url.searchParams.append("exsectionformat", "plain");
  url.searchParams.append("format", "json");
  url.searchParams.append("origin", "*");
  url.searchParams.append("prop", "extracts");
  url.searchParams.append("titles", answer);
  const response = await (await fetch(url.toString())).json();
  const text: string = (Object.values(response.query.pages)[0] as any).extract;
  if (!text) {
    throw new Error(`No text found for ${answer}`);
  }

  // Ignore disambiguation pages
  if (text.slice(0, 100).includes(" may refer to")) {
    throw new Error(`Found disambiguation page for ${answer}`);
  }

  // Ignore taxonomical names
  if (/is a (phylum|class|order|family|genus|species)/.test(text)) {
    throw new Error(`Found taxonomical name for ${answer}`);
  }

  // Generate alternate answers
  const alternates = [answer];
  if (topic === "People") {
    if (answer.includes(" of ")) {
      alternates.push(answer.split(" of ")[0]);
    } else {
      alternates.push(answer.split(" ").slice(-1)[0]); // Last name
    }
  }
  DEBUG_ANSWER && console.log("Alternates:", alternates);

  // Generate hints
  const sentences = text
    // Remove final sections
    .replace(
      /\b(Gallery|External links|Notes|References|See also|Selected works|Works)\b(.|\n)*/gm,
      "",
    )
    // Remove section headings
    .replace(/(?<=\n\n)[A-Z][^\n]+[^.]\n(?=[A-Z]|\n)/g, "")
    // Remove parentheses
    .replace(/ *\([^)]*\)/g, "")
    // Split into sentences
    .split(/(?<=(?<! [A-Z][a-z]?)[.?!])\s+(?=[^a-z])/gm)
    // Strip headings, leading dates (i.e. from timeline lists), and whitespace
    .map(s =>
      s
        .split("\n")
        .slice(-1)[0]
        .replace(/^\d+: /, "")
        .trim(),
    )
    // Ignore media and fragments
    .filter((s, i) => {
      const valid = !/^[a-z]|\{\{|cite book|diagram|displaystyle/.test(s);
      if (!valid && i === 0) {
        throw new Error(`First sentence is invalid for ${answer}`);
      }
      return valid;
    })
    // Redact answer
    .map(sentence => {
      let result = sentence;
      for (const answer of alternates) {
        switch (topic) {
          case "Geography": {
            result = result.replace(
              new RegExp(`\\b(the )?${answer}\\b`, "gi"),
              "<em>this place</em>",
            );
            break;
          }
          case "People": {
            result = result.replace(
              new RegExp(`\\b${answer}\\b`, "gi"),
              "<em>this person</em>",
            );
            break;
          }
          default: {
            if (
              answer.endsWith("s") &&
              !answer.endsWith("ics") && // e.g. kinematics
              (() => {
                const lastWord = answer.split(" ").slice(-1)[0];
                return new RegExp(
                  `\\b(${lastWord.slice(0, -2)}|${lastWord.slice(0, -1)})\\b`,
                  "i",
                ).test(text);
              })()
            ) {
              // Answer is plural. TODO: Handle -ies answers
              result = result.replace(
                new RegExp(`\\b(the )?${answer}\\b`, "gi"),
                "<em>these</em>",
              );
            } else {
              if (answer.endsWith("y")) {
                // Answer is singular -y
                result = result.replace(
                  new RegExp(`\\b(the )?${answer.slice(0, -1)}ies\\b`, "gi"),
                  "<em>these</em>",
                );
              } else {
                // Answer is singular but not -y
                result = result.replace(
                  new RegExp(`\\b((an?|the) )?${answer}s\\b`, "gi"),
                  "<em>these</em>",
                );
              }
              result = result.replace(
                new RegExp(`\\b((an?|the) )?${answer}\\b`, "gi"),
                "<em>this</em>",
              );
            }
            break;
          }
        }
      }
      return result;
    })
    .filter((sentence, i) => {
      // Always allow the first sentence
      if (i < 1) {
        return true;
      }

      return (
        // Require a range of chars
        sentence.length > 40 &&
        sentence.length < 200 &&
        // Ignore sentences that don't mention the answer
        sentence.includes("<em>") &&
        // Ignore sentences that contain spoilers
        !/plural|pronounce|pronunciation/i.test(sentence) &&
        // Ignore sentences that contain the answer attached to something
        !/\b[A-Z][a-z]{2,} <|[-/]<|>[-/]|> [A-Z]/.test(sentence) &&
        // Ignore sentences that still contain the answer (or much of it)
        !alternates.some(a =>
          sentence
            .toLowerCase()
            .includes(a.toLowerCase().replace(/^the /i, "").slice(0, 4)),
        ) &&
        // Ignore orphaned references and comparisons
        !/(^(so|though|both|\w+ contrast|overall|then|he|she|they|these|those|that|this|it|later|such|this section|now|for example)|(subsequently|same|another|furthermore|similarly|such|therefore|however|thus))\b(?!<)/i.test(
          sentence,
        )
      );
    });
  console.log("Sentences:", sentences);
  if (sentences.length < 2) {
    throw new Error(`Not enough content for ${answer}`);
  }

  // Construct the revealer hint
  let revealer = `${sentences[0].replace(
    />[^<>]*( or .+?|, (also|commonly|known as|officially|sometimes|spelled) .+?,)(?= (is|are|was|were) )/,
    ">",
  )}`;
  if (topic === "People") {
    // This is crude but more reliable than regexing names
    const predicate = revealer
      .split(/ (?=is|was)/)
      .slice(1)
      .join(" ");
    if (!predicate) {
      throw new Error(`No bio sentence found for ${answer}`);
    }
    revealer = `<em>this person</em> ${predicate}`;
  }
  revealer = `For 10 points: ${revealer[0].toLowerCase()}${revealer.slice(1)}`;
  const hints = [sentences[1], revealer];
  let unusedHints = sentences.slice(2);

  // Add more hints until we have enough content
  while (true) {
    const questionLength = hints.join(" ").length;
    if (questionLength > 550) {
      break;
    }
    if (!unusedHints.length) {
      if (questionLength < 350) {
        throw new Error(`Not enough content for ${answer}`);
      }
      break;
    }
    const hint = randomElement(unusedHints);
    hints.unshift(hint);
    unusedHints = unusedHints.filter(h => h !== hint);
  }

  // Construct question HTML
  return `<strong>${topic}</strong><br><br>${hints
    // Fix casing and remove orphaned modifiers
    .map(h => h.replace(/^<em>t/, "<em>T").replace(/ also/g, ""))
    .join(" ")
    .replace(
      /\n/g,
      "<br>",
    )}<br><br><strong>Answer:</strong> <a href="https://en.wikipedia.org/wiki/${encodeURIComponent(rawAnswer.replace(/ /g, "_"))}" target="_blank">${answer}</a>`;
};

let DEBUG_ANSWER: [string, string];
// Temporarily customize and uncomment this line to debug a specific answer
// DEBUG_ANSWER = ["History", "Islamic schools and branches"];

(async () => {
  // Load all possible answers
  const $questions = document.querySelector("#questions")! as HTMLDivElement;
  const $topic = document.querySelector("#topic")! as HTMLSelectElement;
  const $count = document.querySelector("#count")! as HTMLSelectElement;
  const $difficulty = document.querySelector(
    "#difficulty",
  )! as HTMLSelectElement;
  const answers: Record<string, string[]>[] = await (
    await fetch("vital-articles.json")
  ).json();

  // Load packet questions
  const seenAnswers = new Set<string>();
  const loadQuestions = async () => {
    const count = parseInt($count.value);
    $questions.innerHTML = "";
    const topicsAndAnswers = Object.entries(
      answers[parseInt($difficulty.value) - 1],
    )
      .filter(([topic]) => $topic.value === "All" || topic === $topic.value)
      .flatMap(([topic, answers]) => answers.map(a => [topic, a]));
    for (let i = 0; i < (DEBUG_ANSWER ? 1 : count); i++) {
      for (let j = 0; j < (DEBUG_ANSWER ? 1 : 5); j++) {
        try {
          // Choose random answer
          const [topic, answer] =
            DEBUG_ANSWER ?? randomElement(topicsAndAnswers);
          if (seenAnswers.has(answer)) {
            continue;
          }
          seenAnswers.add(answer);
          if (
            [
              /.{30,}/, // Long answers
              /\b(1\d|20)\d\d\b/, // Year-specific answers
              /^(Cinema|History) of /, // Listings
              /^[A-Z][a-z]{4,}ae$/, // Taxonomical names
            ].some(r => r.test(answer))
          ) {
            console.log("Skipping", answer);
            continue;
          }

          // Generate question
          const questionHtml = await generateQuestion(topic, answer);
          const questionDiv = document.createElement("div");
          questionDiv.className = "question";
          questionDiv.innerHTML = questionHtml;
          $questions.appendChild(questionDiv);
          break;
        } catch (ex) {
          console.warn((ex as Error).message);
        }
      }
    }
  };
  document.querySelector("#generate")!.addEventListener("click", loadQuestions);
})();
