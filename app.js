(function () {
  "use strict";

  const TOTAL_SECONDS = 30 * 60;
  const views = {
    home: document.getElementById("homeView"),
    tests: document.getElementById("testsView"),
    quiz: document.getElementById("quizView"),
    matrix: document.getElementById("matrixView"),
    bank: document.getElementById("bankView"),
    report: document.getElementById("reportView"),
  };
  const testTabsWrapper = document.getElementById("testTabsWrapper");
  const testTabs = document.getElementById("testTabs");
  const state = {
    topic: null,
    test: null,
    tests: [],
    questionIndex: 0,
    answers: new Map(),
    secondsRemaining: TOTAL_SECONDS,
    timer: null,
    questionObserver: null,
    submitted: false,
    review: false,
    currentView: "home",
  };

  const byId = (id) => document.getElementById(id);
  const topicFor = (id) => window.QUIZ_DATA.topics.find((topic) => topic.id === id);

  function showView(name) {
    Object.entries(views).forEach(([viewName, element]) => {
      element.classList.toggle("active", viewName === name);
    });
    state.currentView = name;
    testTabsWrapper.hidden = name === "home" || !state.topic;
    updateHeaderActions();
    testTabs.querySelectorAll(".tab-btn").forEach((tab) => {
      const selected = tab.dataset.view === name ||
        (tab.dataset.test !== undefined && name === "quiz" && Number(tab.dataset.test) === state.test?.number);
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function getQuestionOutcome(question) {
    const answer = state.answers.get(question.id);
    if (answer === undefined) return "missing";
    return answer === question.correct_letter ? "correct" : "wrong";
  }

  function shuffle(items) {
    const shuffled = items.slice();
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function hasPositionReferences(question) {
    const content = `${question.text} ${question.options.map((option) => option.text).join(" ")}`;
    return /\b(?:đáp án|phương án|lựa chọn)\s+[A-D]\b|\bcả\s+[A-D]\s*(?:và|,)\s*[A-D]\b/i.test(content);
  }

  function generateRuntimeTests(topicId) {
    const sourceQuestions = window.QUIZ_DATA.banks[topicId];
    if (!Array.isArray(sourceQuestions) || sourceQuestions.length < 30) {
      throw new Error(`Ngân hàng câu hỏi của chủ đề "${topicId}" không hợp lệ.`);
    }
    const appearances = new Map(sourceQuestions.map((question) => [question.number, 0]));
    const correctLetters = ["A", "B", "C", "D"];
    const tests = [];

    for (let testNumber = 1; testNumber <= 7; testNumber += 1) {
      const randomizedPool = shuffle(sourceQuestions);
      randomizedPool.sort(
        (left, right) => appearances.get(left.number) - appearances.get(right.number),
      );
      const selected = shuffle(randomizedPool.slice(0, 30));
      const fixedQuestions = selected.filter(hasPositionReferences);
      const correctPositionCounts = Object.fromEntries(correctLetters.map((letter) => [letter, 0]));

      fixedQuestions.forEach((question) => {
        correctPositionCounts[question.correct_letter] += 1;
      });

      const questions = selected.map((question, index) => {
        const correctOption = question.options.find((option) => option.is_correct);
        let choices;
        let correctLetter;

        if (hasPositionReferences(question)) {
          correctLetter = correctOption.letter;
          choices = question.options
            .slice()
            .sort((left, right) => left.letter.localeCompare(right.letter))
            .map(({ letter, text }) => ({ letter, text }));
        } else {
          const leastUsed = Math.min(...correctLetters.map((letter) => correctPositionCounts[letter]));
          const availableLetters = correctLetters.filter(
            (letter) => correctPositionCounts[letter] === leastUsed,
          );
          correctLetter = availableLetters[Math.floor(Math.random() * availableLetters.length)];
          correctPositionCounts[correctLetter] += 1;
          const distractors = shuffle(
            question.options.filter((option) => !option.is_correct).map((option) => option.text),
          );
          let distractorIndex = 0;
          choices = correctLetters.map((letter) => ({
            letter,
            text: letter === correctLetter ? correctOption.text : distractors[distractorIndex++],
          }));
        }

        appearances.set(question.number, appearances.get(question.number) + 1);
        return {
          id: `${topicId}-q${question.number}`,
          number: index + 1,
          source_number: question.number,
          text: question.text,
          choices,
          correct_letter: correctLetter,
        };
      });

      tests.push({ number: testNumber, title: `Đề ${testNumber}`, questions });
    }

    return tests;
  }

  function renderTopics() {
    const grid = byId("topicGrid");
    grid.replaceChildren();
    window.QUIZ_DATA.topics.forEach((topic, index) => {
      const card = makeElement("button", "topic-card");
      card.type = "button";
      card.setAttribute("aria-label", `Chọn chủ đề ${topic.title}`);
      card.append(makeElement("span", "topic-icon", index === 0 ? "M-L" : "HCM"));
      card.append(makeElement("span", "topic-title", topic.title));

      const facts = makeElement("span", "topic-card-bottom");
      const factList = makeElement("span", "topic-facts");
      const bankFact = makeElement("span", "topic-fact");
      bankFact.append(makeElement("strong", "", String(topic.question_count)), document.createTextNode(" câu hỏi"));
      const testFact = makeElement("span", "topic-fact");
      testFact.append(makeElement("strong", "", String(topic.test_count)), document.createTextNode(" đề luyện"));
      factList.append(bankFact, testFact);
      facts.append(factList, makeElement("span", "topic-arrow", "→"));
      card.append(facts);
      card.addEventListener("click", () => selectTopic(topic.id));
      grid.append(card);
    });
  }

  function selectTopic(topicId) {
    const topic = topicFor(topicId);
    if (!topic || !window.QUIZ_DATA.banks[topicId]) {
      throw new Error(`Không tìm thấy dữ liệu cho chủ đề "${topicId}".`);
    }
    state.topic = topic;
    state.tests = generateRuntimeTests(topicId);
    state.test = null;
    stopTimer();
    byId("topicBreadcrumb").textContent = topic.title;
    byId("testsSubtitle").textContent = `${topic.title} · 7 đề độc lập, mỗi đề 30 câu`;
    byId("topicQuestionCount").textContent = String(topic.question_count);
    renderTests();
    showView("tests");
  }

  function renderTests() {
    const grid = byId("testGrid");
    grid.replaceChildren();
    state.tests.forEach((test) => {
      const card = makeElement("button", "test-card");
      card.type = "button";
      card.setAttribute("aria-label", `Bắt đầu đề ${test.number}, 30 câu`);
      const top = makeElement("span", "test-card-top");
      top.append(
        makeElement("span", "test-number", `BÀI LUYỆN ${String(test.number).padStart(2, "0")}`),
        makeElement("span", "test-icon", "✦"),
      );
      card.append(top, makeElement("h2", "", `Đề ${test.number}`));
      const metadata = makeElement("span", "test-card-meta");
      metadata.append(makeElement("span", "", "▤ 30 câu"), makeElement("span", "", "◷ 30 phút"));
      card.append(metadata);
      const start = makeElement("span", "test-start");
      start.append(document.createTextNode("Bắt đầu"), makeElement("span", "", "→"));
      card.append(start);
      card.addEventListener("click", () => startTest(test.number));
      grid.append(card);
    });
    renderTestTabs();
  }

  function renderTestTabs() {
    testTabs.replaceChildren();
    if (!state.topic) return;
    state.tests.forEach((test) => {
      const tab = makeElement("button", "tab-btn");
      tab.type = "button";
      tab.id = `test-tab-${test.number}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", "quizView");
      tab.dataset.test = String(test.number);
      const isActive = state.currentView === "quiz" && state.test?.number === test.number;
      tab.setAttribute("aria-selected", String(isActive));
      if (isActive) tab.classList.add("active");
      tab.append(
        document.createTextNode(test.title),
        makeElement("span", "tab-badge", "30 câu"),
      );
      tab.addEventListener("click", () => {
        if (state.currentView === "quiz" && state.test?.number === test.number) return;
        if (["matrix", "bank", "report"].includes(state.currentView) && state.test?.number === test.number) {
          resumeCurrentTest();
          return;
        }
        selectTestFromTab(test.number);
      });
      testTabs.append(tab);
    });
    [
      { id: "matrix", label: "📊 Bảng đáp án chi tiết" },
      { id: "bank", label: "📚 Ngân hàng câu hỏi gốc" },
      { id: "report", label: "📋 Báo cáo dữ liệu" },
    ].forEach(({ id, label }) => {
      const tab = makeElement("button", "tab-btn", label);
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.dataset.view = id;
      tab.setAttribute("aria-controls", `${id}View`);
      tab.setAttribute("aria-selected", String(state.currentView === id));
      if (state.currentView === id) tab.classList.add("active");
      tab.addEventListener("click", () => openDataView(id));
      testTabs.append(tab);
    });
  }

  function selectTestFromTab(testNumber) {
    if (state.test?.number === testNumber && state.currentView === "quiz") {
      return;
    }
    if (
      state.test &&
      state.test.number !== testNumber &&
      !state.submitted &&
      state.answers.size > 0
    ) {
      const confirmed = window.confirm(
        "Bài hiện tại chưa nộp. Chuyển đề sẽ xóa các câu trả lời đã chọn. Bạn có muốn tiếp tục?",
      );
      if (!confirmed) return;
    }
    startTest(testNumber);
  }

  function startTest(testNumber) {
    const selectedTest = state.tests[testNumber - 1];
    if (!selectedTest || selectedTest.questions.length !== 30) {
      throw new Error(`Đề ${testNumber} không có đủ 30 câu hỏi.`);
    }
    stopTimer();
    state.test = selectedTest;
    state.questionIndex = 0;
    state.answers = new Map();
    state.secondsRemaining = TOTAL_SECONDS;
    state.submitted = false;
    state.review = false;
    renderTestTabs();
    byId("quizTitle").textContent = state.test.title;
    byId("quizTopicLabel").textContent = state.topic.title;
    byId("quizBreadcrumb").textContent = `${state.topic.title} / ${state.test.title}`;
    byId("resultModal").hidden = true;
    renderQuestions();
    renderQuestionGrid();
    updateProgress();
    updateTimer();
    showView("quiz");
    if (!state.submitted) state.timer = window.setInterval(tick, 1000);
  }

  function resumeCurrentTest() {
    if (!state.test) {
      showView("tests");
      return;
    }
    renderQuestions();
    renderQuestionGrid();
    updateProgress();
    showView("quiz");
    if (!state.submitted && state.timer === null) {
      state.timer = window.setInterval(tick, 1000);
    }
  }

  function openDataView(name) {
    stopTimer();
    if (state.questionObserver) {
      state.questionObserver.disconnect();
      state.questionObserver = null;
    }
    if (name === "matrix") renderAnswerMatrix();
    else if (name === "bank") renderQuestionBank();
    else if (name === "report") renderDataReport();
    showView(name);
  }

  function updateHeaderActions() {
    const hasCurrentTest = Boolean(state.test) && state.currentView === "quiz";
    byId("resetQuiz").disabled = !hasCurrentTest;
    byId("downloadQuiz").disabled = !hasCurrentTest;
  }

  function getCurrentTopicTests() {
    if (!state.topic) throw new Error("Hãy chọn một chủ đề trước.");
    return state.tests;
  }

  function renderAnswerMatrix() {
    const bank = window.QUIZ_DATA.banks[state.topic.id];
    if (!Array.isArray(bank)) throw new Error(`Thiếu ngân hàng câu hỏi: ${state.topic.id}`);
    byId("matrixTopic").textContent = state.topic.title;

    const tests = getCurrentTopicTests();
    const table = makeElement("table", "key-table");
    const thead = makeElement("thead");
    const header = makeElement("tr");
    header.append(makeElement("th", "key-question-heading", "Câu gốc"));
    tests.forEach((test) => header.append(makeElement("th", "", `Đề ${test.number}`)));
    thead.append(header);
    const tbody = makeElement("tbody");
    const answerBySource = tests.map((test) => {
      const answers = new Map();
      test.questions.forEach((question) => answers.set(question.source_number, question.correct_letter));
      return answers;
    });

    bank.forEach((question) => {
      const row = makeElement("tr");
      const sourceCell = makeElement("th", "key-question-number", String(question.number).padStart(3, "0"));
      sourceCell.scope = "row";
      sourceCell.title = question.text;
      row.append(sourceCell);
      answerBySource.forEach((answers, testIndex) => {
        const answer = answers.get(question.number);
        const cell = makeElement("td", answer ? "key-answer" : "key-omitted", answer || "—");
        cell.setAttribute(
          "aria-label",
          answer ? `Câu gốc ${question.number}, đề ${testIndex + 1}: đáp án ${answer}` : `Câu gốc ${question.number} không có trong đề ${testIndex + 1}`,
        );
        row.append(cell);
      });
      tbody.append(row);
    });

    table.append(thead, tbody);
    byId("matrixTable").replaceChildren(table);
  }

  function renderQuestionBank() {
    const topicFilter = byId("bankTopicFilter");
    if (!topicFilter.options.length) {
      topicFilter.append(new Option("Tất cả chủ đề", "all"));
      window.QUIZ_DATA.topics.forEach((topic) => {
        topicFilter.append(new Option(topic.title, topic.id));
      });
    }
    topicFilter.value = state.topic.id;
    byId("bankSearch").value = "";
    byId("bankTopic").textContent = state.topic.title;
    renderBankResults();
  }

  function renderBankResults() {
    const query = byId("bankSearch").value.trim().toLocaleLowerCase("vi");
    const selectedTopic = byId("bankTopicFilter").value || state.topic.id;
    const topics = selectedTopic === "all"
      ? window.QUIZ_DATA.topics
      : window.QUIZ_DATA.topics.filter((topic) => topic.id === selectedTopic);
    const results = [];

    topics.forEach((topic) => {
      const sourceQuestions = window.QUIZ_DATA.banks[topic.id];
      if (!Array.isArray(sourceQuestions)) {
        throw new Error(`Thiếu ngân hàng câu hỏi: ${topic.id}`);
      }
      sourceQuestions.forEach((question) => {
        const searchable = `${question.number} ${question.text} ${question.options.map((option) => option.text).join(" ")}`.toLocaleLowerCase("vi");
        if (!query || searchable.includes(query)) results.push({ topic, question });
      });
    });

    const container = byId("bankResults");
    container.replaceChildren();
    byId("bankSummary").textContent = `${results.length} câu hỏi${selectedTopic === "all" ? " trong cả hai chủ đề" : ` · ${topics[0]?.title || ""}`}`;
    if (!results.length) {
      container.append(makeElement("p", "empty-state", "Không tìm thấy câu hỏi phù hợp."));
      return;
    }

    results.forEach(({ topic, question }) => {
      const card = makeElement("article", "bank-card");
      const heading = makeElement("div", "bank-card-heading");
      heading.append(
        makeElement("span", "question-number", `CÂU GỐC ${String(question.number).padStart(3, "0")}`),
        makeElement("span", "bank-topic-label", topic.title),
      );
      card.append(heading, makeElement("h2", "bank-question-text", question.text));
      const options = makeElement("div", "bank-options");
      question.options.forEach((option) => {
        const row = makeElement("div", `bank-option${option.is_correct ? " bank-option-correct" : ""}`);
        row.append(
          makeElement("span", "choice-letter", option.letter),
          makeElement("span", "choice-text", option.text),
          option.is_correct ? makeElement("span", "correct-label", "Đáp án đúng") : document.createTextNode(""),
        );
        options.append(row);
      });
      card.append(options);
      container.append(card);
    });
  }

  function validateTopicData(topic) {
    const sourceQuestions = window.QUIZ_DATA.banks[topic.id] || [];
    const tests = topic.id === state.topic?.id
      ? state.tests
      : window.QUIZ_DATA.tests[topic.id] || [];
    let invalidSource = 0;
    sourceQuestions.forEach((question) => {
      const labels = question.options.map((option) => option.letter);
      const correct = question.options.filter((option) => option.is_correct);
      if (labels.length !== 4 || new Set(labels).size !== 4 || correct.length !== 1) invalidSource += 1;
    });
    let invalidGenerated = 0;
    tests.forEach((test) => {
      if (test.questions.length !== 30) invalidGenerated += 1;
      test.questions.forEach((question) => {
        const labels = question.choices.map((choice) => choice.letter);
        const correct = question.choices.filter((choice) => choice.letter === question.correct_letter);
        if (labels.length !== 4 || new Set(labels).size !== 4 || correct.length !== 1) invalidGenerated += 1;
      });
    });
    return { sourceQuestions, tests, invalidSource, invalidGenerated };
  }

  function renderDataReport() {
    byId("reportTopic").textContent = state.topic.title;
    const topicStats = window.QUIZ_DATA.topics.map((topic) => ({
      topic,
      ...validateTopicData(topic),
    }));
    const allSourceCount = topicStats.reduce((sum, item) => sum + item.sourceQuestions.length, 0);
    const allTestCount = topicStats.reduce((sum, item) => sum + item.tests.length, 0);
    const invalidCount = topicStats.reduce((sum, item) => sum + item.invalidSource + item.invalidGenerated, 0);

    const badges = byId("reportBadges");
    badges.replaceChildren();
    [
      [allSourceCount, "câu hỏi gốc"],
      [allTestCount, "đề đã tạo"],
      [allTestCount * 30, "lượt câu hỏi"],
      [invalidCount, "lỗi dữ liệu"],
    ].forEach(([value, label]) => {
      const badge = makeElement("div", `report-badge${label === "lỗi dữ liệu" && value === 0 ? " report-good" : ""}`);
      badge.append(makeElement("strong", "", String(value)), makeElement("span", "", label));
      badges.append(badge);
    });

    const cards = byId("reportTopics");
    cards.replaceChildren();
    topicStats.forEach(({ topic, sourceQuestions, tests, invalidSource, invalidGenerated }) => {
      const card = makeElement("article", "report-topic-card");
      const heading = makeElement("div", "report-topic-heading");
      heading.append(
        makeElement("h2", "", topic.title),
        makeElement("span", invalidSource + invalidGenerated === 0 ? "quality-status" : "quality-status quality-error", invalidSource + invalidGenerated === 0 ? "✓ Hợp lệ" : "⚠ Cần kiểm tra"),
      );
      card.append(heading);
      const coverage = new Set(tests.flatMap((test) => test.questions.map((question) => question.source_number)));
      const rows = [
        ["Câu hỏi nguồn", `${sourceQuestions.length} / ${topic.question_count}`],
        ["Đề luyện tập", `${tests.length} / ${topic.test_count} · ${topic.questions_per_test} câu mỗi đề`],
        ["Câu nguồn đã được dùng", `${coverage.size} / ${sourceQuestions.length}`],
        ["Lỗi câu hỏi nguồn", String(invalidSource)],
        ["Lỗi câu hỏi trong đề", String(invalidGenerated)],
      ];
      const list = makeElement("dl", "report-stats");
      rows.forEach(([label, value]) => {
        list.append(makeElement("dt", "", label), makeElement("dd", "", value));
      });
      card.append(list);
      cards.append(card);
    });
  }

  function downloadText(filename, content) {
    const blob = new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = makeElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCurrentTest() {
    if (!state.test) return;
    const lines = [
      `${state.topic.title} — ${state.test.title}`,
      `${state.test.questions.length} câu hỏi`,
      "",
    ];
    state.test.questions.forEach((question) => {
      lines.push(`${question.number}. ${question.text}`);
      question.choices.forEach((choice) => lines.push(`   ${choice.letter}. ${choice.text}`));
      lines.push("");
    });
    downloadText(`${state.topic.id}-de-${state.test.number}.txt`, lines.join("\n"));
  }

  function downloadAnswerMatrix() {
    const tests = getCurrentTopicTests();
    const answers = new Map();
    tests.forEach((test) => {
      const testAnswers = new Map();
      test.questions.forEach((question) => testAnswers.set(question.source_number, question.correct_letter));
      answers.set(test.number, testAnswers);
    });
    const lines = [`Bảng đáp án — ${state.topic.title}`, `Câu gốc\t${tests.map((test) => test.title).join("\t")}`];
    (window.QUIZ_DATA.banks[state.topic.id] || []).forEach((question) => {
      lines.push(`${question.number}\t${tests.map((test) => answers.get(test.number).get(question.number) || "—").join("\t")}`);
    });
    downloadText(`${state.topic.id}-bang-dap-an.txt`, lines.join("\n"));
  }

  function resetCurrentTest() {
    if (!state.test) return;
    if ((state.answers.size > 0 || state.submitted) && !window.confirm("Làm lại đề sẽ xóa câu trả lời và kết quả hiện tại. Bạn có muốn tiếp tục?")) return;
    startTest(state.test.number);
  }

  function returnFromDataView() {
    if (state.test) resumeCurrentTest();
    else showView("tests");
  }

  function renderQuestions() {
    if (state.questionObserver) {
      state.questionObserver.disconnect();
      state.questionObserver = null;
    }

    const list = byId("questionsList");
    list.replaceChildren();
    state.test.questions.forEach((question) => {
      const card = makeElement("article", "question-card");
      card.id = `question-${question.number}`;
      card.dataset.questionIndex = String(question.number - 1);
      card.setAttribute("aria-labelledby", `question-text-${question.number}`);

      const overline = makeElement("div", "question-overline");
      const answerState = makeElement(
        "span",
        "answer-state",
        state.review
          ? {
              correct: "Đúng",
              wrong: "Sai",
              missing: "Thiếu",
            }[getQuestionOutcome(question)]
          : state.answers.has(question.id)
            ? "Đã lưu lựa chọn"
            : "Chọn một đáp án",
      );
      if (state.review) answerState.classList.add(`answer-state-${getQuestionOutcome(question)}`);
      overline.append(
        makeElement("span", "question-number", `CÂU ${String(question.number).padStart(2, "0")}`),
        answerState,
      );
      const title = makeElement("h2", "question-text", question.text);
      title.id = `question-text-${question.number}`;
      const choices = makeElement("div", "choices-list");
      choices.setAttribute("role", "radiogroup");
      choices.setAttribute("aria-labelledby", title.id);

      question.choices.forEach((choice) => {
        const button = makeElement("button", "choice");
        button.type = "button";
        button.setAttribute("role", "radio");
        const isSelected = state.answers.get(question.id) === choice.letter;
        button.setAttribute("aria-checked", String(isSelected));
        if (isSelected) button.classList.add("selected");
        if (state.review && choice.letter === question.correct_letter) {
          button.classList.add("review-correct");
        } else if (state.review && isSelected) {
          button.classList.add("review-wrong");
        }
        button.append(
          makeElement("span", "choice-letter", choice.letter),
          makeElement("span", "choice-text", choice.text),
        );
        button.disabled = state.submitted;
        button.addEventListener("click", () => selectAnswer(question, choice.letter));
        choices.append(button);
      });

      card.append(overline, title, choices);
      list.append(card);
    });

    state.questionObserver = new IntersectionObserver(
      (entries) => {
        const visibleCards = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visibleCards.length) {
          updateCurrentQuestion(Number(visibleCards[0].target.dataset.questionIndex));
        }
      },
      { rootMargin: "-15% 0px -65% 0px", threshold: [0, 0.2, 0.5, 0.8] },
    );
    list.querySelectorAll(".question-card").forEach((card) => {
      state.questionObserver.observe(card);
    });
    updateCurrentQuestion(state.questionIndex);
  }

  function updateCurrentQuestion(index) {
    state.questionIndex = index;
    byId("questionGrid").querySelectorAll(".grid-button").forEach((button, buttonIndex) => {
      const isCurrent = buttonIndex === index;
      button.classList.toggle("current", isCurrent);
      if (isCurrent) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function selectAnswer(question, letter) {
    if (state.submitted) return;
    state.answers.set(question.id, letter);
    const card = byId(`question-${question.number}`);
    card.querySelectorAll(".choice").forEach((button) => {
      const selected = button.querySelector(".choice-letter").textContent === letter;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    card.querySelector(".answer-state").textContent = "Đã lưu lựa chọn";
    updateProgress();
    renderQuestionGrid();
    updateCurrentQuestion(question.number - 1);
  }

  function renderQuestionGrid() {
    const grid = byId("questionGrid");
    if (!state.test) return;
    grid.replaceChildren();
    state.test.questions.forEach((question, index) => {
      const button = makeElement(
        "button",
        "grid-button",
        String(question.number).padStart(2, "0"),
      );
      button.type = "button";
      button.setAttribute("aria-label", `Cuộn tới câu ${question.number}`);
      if (state.answers.has(question.id)) button.classList.add("answered");
      if (state.review) {
        const outcome = getQuestionOutcome(question);
        if (outcome === "correct") {
          button.classList.add("review-correct");
        } else if (outcome === "wrong") {
          button.classList.add("review-wrong");
        } else {
          button.classList.add("review-missing");
        }
      }
      button.addEventListener("click", () => {
        updateCurrentQuestion(index);
        byId(`question-${question.number}`).scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      grid.append(button);
    });
    updateCurrentQuestion(state.questionIndex);
    renderQuestionGridLegend();
  }

  function renderQuestionGridLegend() {
    const legend = document.querySelector(".grid-legend");
    legend.replaceChildren();
    const items = state.review
      ? [
          ["review-correct-dot", "Đúng"],
          ["review-wrong-dot", "Sai"],
          ["review-missing-dot", "Thiếu"],
        ]
      : [
          ["answered-dot", "Đã chọn"],
          ["current-dot", "Đang xem"],
        ];
    items.forEach(([dotClass, label]) => {
      const item = makeElement("span");
      item.append(makeElement("i", `legend-dot ${dotClass}`), document.createTextNode(label));
      legend.append(item);
    });
  }

  function updateProgress() {
    if (!state.test) return;
    const answered = state.answers.size;
    const percentage = (answered / state.test.questions.length) * 100;
    byId("progressLabel").textContent = `${answered} / ${state.test.questions.length} câu`;
    byId("progressFill").style.width = `${percentage}%`;
    byId("sidebarAnswered").textContent = `${answered} / ${state.test.questions.length}`;
  }

  function updateTimer() {
    const minutes = Math.floor(state.secondsRemaining / 60);
    const seconds = state.secondsRemaining % 60;
    byId("timerText").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    byId("timerPill").classList.toggle("low-time", state.secondsRemaining <= 5 * 60);
  }

  function tick() {
    state.secondsRemaining -= 1;
    updateTimer();
    if (state.secondsRemaining <= 0) submitTest(true);
  }

  function stopTimer() {
    if (state.timer !== null) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
  }

  function submitTest(expired = false) {
    if (state.submitted) return;
    const unanswered = state.test.questions.length - state.answers.size;
    if (!expired && unanswered > 0) {
      const confirmed = window.confirm(
        `Bạn còn ${unanswered} câu chưa trả lời. Bạn vẫn muốn nộp bài chứ?`,
      );
      if (!confirmed) return;
    }

    state.submitted = true;
    state.review = false;
    stopTimer();
    const correct = state.test.questions.filter(
      (question) => state.answers.get(question.id) === question.correct_letter,
    ).length;
    const wrong = state.answers.size - correct;
    const skipped = state.test.questions.length - state.answers.size;
    const score = ((correct / state.test.questions.length) * 10).toFixed(1);

    byId("resultTitle").textContent = expired ? "Đã hết thời gian!" : "Hoàn thành bài làm!";
    byId("resultTopic").textContent = `${state.topic.title} · ${state.test.title}`;
    byId("scoreValue").textContent = score;
    byId("correctCount").textContent = String(correct);
    byId("wrongCount").textContent = String(wrong);
    byId("skippedCount").textContent = String(skipped);
    byId("resultFeedback").textContent = correct >= 24
      ? "Tuyệt vời! Bạn đã nắm rất vững nội dung."
      : correct >= 15
        ? "Khá tốt! Hãy xem lại những câu chưa chính xác nhé."
        : "Đừng nản lòng — xem lại đáp án và thử thêm một lần nữa.";
    byId("resultModal").hidden = false;
    renderQuestions();
    renderQuestionGrid();
  }

  function reviewAnswers() {
    state.review = true;
    byId("resultModal").hidden = true;
    state.questionIndex = 0;
    renderQuestions();
    renderQuestionGrid();
    showView("quiz");
  }

  function leaveQuiz() {
    stopTimer();
    if (state.questionObserver) {
      state.questionObserver.disconnect();
      state.questionObserver = null;
    }
    state.test = null;
    state.submitted = false;
    state.review = false;
    renderTestTabs();
    byId("resultModal").hidden = true;
    showView("tests");
  }

  function goHome() {
    stopTimer();
    if (state.questionObserver) {
      state.questionObserver.disconnect();
      state.questionObserver = null;
    }
    state.test = null;
    state.topic = null;
    renderTestTabs();
    byId("resultModal").hidden = true;
    showView("home");
  }

  function toggleTheme() {
    const root = document.documentElement;
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = nextTheme;
    byId("themeToggle").textContent = nextTheme === "dark" ? "☀" : "☾";
    byId("themeToggle").setAttribute(
      "aria-label",
      nextTheme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối",
    );
  }

  function initialize() {
    if (!window.QUIZ_DATA || !Array.isArray(window.QUIZ_DATA.topics)) {
      throw new Error("Không tải được dữ liệu quiz. Hãy chạy generate_quizzes.py trước.");
    }
    renderTopics();
    byId("brandHome").addEventListener("click", (event) => {
      event.preventDefault();
      goHome();
    });
    byId("backToTopics").addEventListener("click", goHome);
    byId("backToTests").addEventListener("click", leaveQuiz);
    ["matrixBack", "bankBack", "reportBack"].forEach((id) => {
      byId(id).addEventListener("click", returnFromDataView);
    });
    byId("themeToggle").addEventListener("click", toggleTheme);
    byId("resetQuiz").addEventListener("click", resetCurrentTest);
    byId("resetQuizSidebar").addEventListener("click", resetCurrentTest);
    byId("downloadQuiz").addEventListener("click", downloadCurrentTest);
    byId("downloadQuizSidebar").addEventListener("click", downloadCurrentTest);
    byId("downloadMatrix").addEventListener("click", downloadAnswerMatrix);
    byId("bankTopicFilter").addEventListener("change", renderBankResults);
    byId("bankSearch").addEventListener("input", renderBankResults);
    byId("submitQuiz").addEventListener("click", () => submitTest());
    byId("submitMobile").addEventListener("click", () => submitTest());
    byId("reviewAnswers").addEventListener("click", reviewAnswers);
    byId("retakeQuiz").addEventListener("click", () => startTest(state.test.number));
    byId("resultToTests").addEventListener("click", leaveQuiz);
    byId("closeResult").addEventListener("click", () => {
      byId("resultModal").hidden = true;
    });
    byId("resultModal").addEventListener("click", (event) => {
      if (event.target === byId("resultModal")) byId("resultModal").hidden = true;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !byId("resultModal").hidden) {
        byId("resultModal").hidden = true;
      }
    });
  }

  initialize();
})();
