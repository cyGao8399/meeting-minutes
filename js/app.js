/* =========================================================
 * 会议纪要整理器 - 核心逻辑
 * 纯前端实现，无外部依赖，所有数据仅在本机浏览器处理。
 * ========================================================= */
"use strict";

(function () {
  /* ---------------- 工具函数 ---------------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function showToast(msg) {
    const toast = $("#toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => (toast.hidden = true), 1800);
  }

  const DUE_PATTERNS = [
    /\d{4}-\d{1,2}-\d{1,2}/,                 // 2026-10-25
    /\d{1,2}月\d{1,2}日?(前?)/,              // 10月20日 / 10月20日前
    /\d{1,2}\/\d{1,2}/,                      // 10/20
    /下{0,1}周[一二三四五六日天]前?/,          // 下周三 / 周五前
    /(本{0,1}月底前)/,                       // 月底前
    /(\d{1,2}号前?)/,                        // 20号前
  ];

  /* ---------------- 解析引擎 ---------------- */
  function parseRawText(raw) {
    const result = { title: "", topics: [], decisions: [], actions: [] };
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      let text = line;

      // 1. 主题
      const titleMatch = text.match(/^(?:会议)?主题\s*[:：]\s*(.+)$/);
      if (titleMatch) {
        result.title = result.title || titleMatch[1].trim();
        continue;
      }

      // 2. 显式前缀分类
      let type = null;
      if (/^(议题|讨论|问题)\s*\d*\s*[:：]?\s*/.test(text)) {
        type = "topics";
        text = text.replace(/^(议题|讨论|问题)\s*\d*\s*[:：]?\s*/, "");
      } else if (/^(结论|决定|共识|决议)\s*\d*\s*[:：]?\s*/.test(text)) {
        type = "decisions";
        text = text.replace(/^(结论|决定|共识|决议)\s*\d*\s*[:：]?\s*/, "");
      } else if (/^(待办|TODO|行动项|跟进事项|行动)\s*\d*\s*[:：]?\s*/i.test(text)) {
        type = "actions";
        text = text.replace(/^(待办|TODO|行动项|跟进事项|行动)\s*\d*\s*[:：]?\s*/i, "");
      }

      // 3. 无显式前缀时按关键词自动归类
      if (!type) {
        if (/(决定|确定|同意|通过|达成共识|拍板)/.test(text)) type = "decisions";
        else if (/(需要|负责|跟进|完成|整理|准备|提交|落实|确认|排查|输出)/.test(text)) type = "actions";
        else if (/[?？]/.test(text) || /(讨论|聊聊|商量)/.test(text)) type = "topics";
        else type = "topics"; // 兜底归入议题
      }

      if (!text) continue;

      if (type === "actions") {
        const { content, owner, due } = extractAction(text);
        result.actions.push({ content, owner, due });
      } else {
        result[type].push(text);
      }
    }
    return result;
  }

  /** 从待办行中提取 @负责人 与截止日期 */
  function extractAction(text) {
    let content = text;
    let owner = "";
    let due = "";

    const ownerMatch = content.match(/@([^\s@，,。；;]+)/);
    if (ownerMatch) {
      owner = ownerMatch[1];
      content = content.replace(/@[^\s@，,。；;]+\s*/, "");
    }
    for (const re of DUE_PATTERNS) {
      const m = content.match(re);
      if (m) {
        due = m[0];
        content = content.replace(re, "");
        break;
      }
    }
    content = content.replace(/\s+/g, " ").replace(/^[，,。；;、\s]+/, "").replace(/[，,。；;、\s]+$/, "").trim();
    return { content, owner, due };
  }

  /* ---------------- Markdown 生成 ---------------- */
  function toMarkdown(data) {
    const md = [];
    md.push(`# ${data.title || "会议纪要"}`);
    md.push("");
    md.push(`> 整理时间：${new Date().toLocaleString("zh-CN")}`);
    md.push("");

    if (data.topics.length) {
      md.push("## 📌 议题");
      md.push("");
      data.topics.forEach((t) => md.push(`- ${t}`));
      md.push("");
    }
    if (data.decisions.length) {
      md.push("## ✅ 结论");
      md.push("");
      data.decisions.forEach((d) => md.push(`- ${d}`));
      md.push("");
    }
    if (data.actions.length) {
      md.push("## 🚀 待办事项");
      md.push("");
      md.push("| 事项 | 负责人 | 截止日期 |");
      md.push("| --- | --- | --- |");
      data.actions.forEach((a) =>
        md.push(`| ${a.content || "-"} | ${a.owner || "待定"} | ${a.due || "待定"} |`)
      );
      md.push("");
    }
    return md.join("\n");
  }

  /* ---------------- 编辑器渲染 ---------------- */
  function renderEdit(data) {
    $("#md-title").value = data.title;

    renderSimpleList("#list-topics", data.topics);
    renderSimpleList("#list-decisions", data.decisions);

    const list = $("#list-actions");
    list.innerHTML = "";
    data.actions.forEach((a) => list.appendChild(buildActionRow(a)));
  }

  function renderSimpleList(selector, items) {
    const list = $(selector);
    list.innerHTML = "";
    items.forEach((text) => list.appendChild(buildSimpleRow(text)));
  }

  function buildSimpleRow(text) {
    const li = document.createElement("li");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "grow";
    input.value = text;
    input.addEventListener("input", onEditChange);
    li.appendChild(input);
    li.appendChild(buildRemoveBtn(li));
    return li;
  }

  function buildActionRow(action) {
    const li = document.createElement("li");
    const mkInput = (cls, val, ph) => {
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val || "";
      input.placeholder = ph;
      input.addEventListener("input", onEditChange);
      return input;
    };
    li.appendChild(mkInput("grow", action.content, "事项内容"));
    li.appendChild(mkInput("owner", action.owner, "负责人"));
    li.appendChild(mkInput("due", action.due, "截止日期"));
    li.appendChild(buildRemoveBtn(li));
    return li;
  }

  function buildRemoveBtn(li) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "item-remove";
    btn.title = "删除";
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      li.remove();
      onEditChange();
    });
    return btn;
  }

  /* ---------------- 编辑态 -> 数据 ---------------- */
  function collectEditData() {
    const data = {
      title: $("#md-title").value.trim(),
      topics: [],
      decisions: [],
      actions: [],
    };
    $$("#list-topics li input").forEach((i) => i.value.trim() && data.topics.push(i.value.trim()));
    $$("#list-decisions li input").forEach((i) => i.value.trim() && data.decisions.push(i.value.trim()));
    $$("#list-actions li").forEach((li) => {
      const content = li.querySelector(".grow").value.trim();
      const owner = li.querySelector(".owner").value.trim();
      const due = li.querySelector(".due").value.trim();
      if (content || owner || due) data.actions.push({ content, owner, due });
    });
    return data;
  }

  /* ---------------- 界面联动 ---------------- */
  let refreshTimer = null;

  function onEditChange() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshOutput, 200);
  }

  function refreshOutput() {
    const data = collectEditData();
    $("#md-output").textContent = toMarkdown(data);
    $("#stat-topic").textContent = data.topics.length;
    $("#stat-decision").textContent = data.decisions.length;
    $("#stat-action").textContent = data.actions.length;
  }

  function switchTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $("#view-edit").hidden = name !== "edit";
    $("#view-preview").hidden = name !== "preview";
  }

  /* ---------------- 导出 ---------------- */
  function copyMarkdown() {
    const text = $("#md-output").textContent;
    const done = () => showToast("已复制到剪贴板 📋");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); }
    catch (e) { showToast("复制失败，请手动选择文本复制"); }
    document.body.removeChild(ta);
  }

  function downloadMarkdown() {
    const data = collectEditData();
    const blob = new Blob([toMarkdown(data)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${(data.title || "会议纪要").replace(/[\\/:*?"<>|]/g, "_")}-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已开始下载 ⬇️");
  }

  /* ---------------- 示例数据 ---------------- */
  const SAMPLE_TEXT = `主题：Q4 产品迭代计划评审
议题1：新版首页上线时间
大家讨论了灰度策略和风险点
议题2：会员体系改版方案
结论：同意 11 月 1 日灰度发布新版首页
结论：会员改版二期延至明年 Q1
待办：@张三 准备灰度发布方案 10月20日
TODO：@李四 整理近一个月用户反馈 下周三前
@王五 跟进新版首页埋点数据 2026-10-25
需要 @赵六 协调设计资源，本周内确认排期`;

  /* ---------------- 事件绑定 ---------------- */
  function bindEvents() {
    $("#btn-parse").addEventListener("click", () => {
      const raw = $("#raw-input").value;
      if (!raw.trim()) {
        showToast("请先粘贴会议记录");
        return;
      }
      const data = parseRawText(raw);
      renderEdit(data);
      refreshOutput();
      $("#edit-empty").hidden = true;
      $("#edit-content").hidden = false;
      $("#stats").hidden = false;
      $("#btn-copy").disabled = false;
      $("#btn-download").disabled = false;
      showToast(`解析完成：议题 ${data.topics.length} / 结论 ${data.decisions.length} / 待办 ${data.actions.length}`);
    });

    $("#btn-sample").addEventListener("click", () => {
      $("#raw-input").value = SAMPLE_TEXT;
      showToast("已填入示例，点击「生成结构化纪要」试试");
    });

    $("#btn-clear").addEventListener("click", () => {
      $("#raw-input").value = "";
      $("#raw-input").focus();
    });

    $("#md-title").addEventListener("input", onEditChange);

    $$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

    $$(".add-item").forEach((btn) =>
      btn.addEventListener("click", () => {
        const section = btn.closest(".edit-section").dataset.section;
        if (section === "actions") {
          $("#list-actions").appendChild(buildActionRow({ content: "", owner: "", due: "" }));
        } else {
          const list = section === "topics" ? "#list-topics" : "#list-decisions";
          $(list).appendChild(buildSimpleRow(""));
        }
        onEditChange();
      })
    );

    $("#btn-copy").addEventListener("click", copyMarkdown);
    $("#btn-download").addEventListener("click", downloadMarkdown);
  }

  /* ---------------- 启动 ---------------- */
  document.addEventListener("DOMContentLoaded", bindEvents);

  // 暴露解析/生成函数，便于单元测试与二次开发
  window.MeetingMinutes = { parseRawText, toMarkdown, extractAction };
})();
