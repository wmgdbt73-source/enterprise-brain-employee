# UI Rules（界面与交互规则）

> Baseline reference: Employee V0.14 prototype in `reference/`.

## 1. Visual Direction（视觉方向）

- shell/frame may use purple-black / dark technology styling;
- primary content surfaces should remain white or very light for readability;
- avoid large low-contrast gray content canvases;
- use purple primarily for selected state, AI identity and primary actions;
- use orange/red for risk or destructive states.

## 2. Global Navigation（全局导航）

Left navigation order:
1. New Conversation（新对话）
2. Plugins（插件）
3. Automation（自动化）
4. Library（资料库）
5. Assistants（助理）
6. Swarms（蜂群）

Then:
- Current Projects / enterprise-assigned work（当前项目 / 企业安排）
- Personal Projects（个人项目）
- History Conversations（历史对话）

Bottom:
- profile（个人资料）
- Notification（通知）
- settings（设置）
- Daily Dashboard（每日工作看板）

## 3. Project Navigation（项目导航）

Fixed five tabs:
- Dynamic（动态）
- Plan（计划）
- Tasks（任务）
- Assets（资产）
- Configuration（配置）

Do not create a sixth Work or Group Chat tab.

## 4. Drill-down Navigation（下钻页面导航）

Secondary / tertiary pages use:

`[Back（返回）] + clickable Breadcrumb（可点击面包屑）`

Rules:
- Back returns to direct parent;
- previous breadcrumb levels are clickable;
- current level is not clickable;
- the five Project tabs remain visible on Project drill-down pages when relevant.

## 5. Chat vs Work UI（聊天与工作界面）

### Chat
- explicit upload / add context;
- no local persistent Workspace implication;
- lightweight `+` menu.

### Work
- desktop runtime identity must be visible;
- New Work Conversation stays in Work;
- user may attach Project / Task / local Workspace context;
- Work `+` may expose richer context and tools.

## 6. Composer（输入区）

General semantics:
- `+` = add context / tool / source（添加上下文 / 工具 / 来源）
- `@` = mention human or Agent（@ 人或 Agent）
- mic = speech-to-text（语音转文字）
- send = submit message / work instruction（发送消息 / 工作指令）

## 7. Project Conversation vs Group Chat（项目 AI 对话与项目群聊）

- Project Conversation is AI-centered work context.
- Group Chat is human collaboration under Dynamic.
- Agent messages in Group Chat require explicit invocation or deliberate sharing.

## 8. Result and Review UI（结果与评审界面）

UI must visually distinguish:
- Artifact（工作产物）
- Result Candidate（正式候选结果）
- AI Precheck（AI 预检）
- Human Review（人工评审）
- Accepted（正式验收）

Never visually imply that AI Precheck equals formal acceptance.

## 9. Notification Center（通知中心）

- continuous white content surface;
- clear black/dark primary text;
- deep gray secondary text;
- thin separators;
- avoid black-top / gray-bottom split.

## 10. Loading / Empty / Error（加载 / 空状态 / 错误状态）

Every productionized screen should define:
- loading state;
- empty state;
- recoverable error state;
- permission denied state when applicable.

## 11. Prototype Usage Rule（原型使用规则）

The V0.14 HTML is a **Visual & Interaction Reference（视觉与交互参考）** only.

Do not:
- continue production development inside the monolithic prototype file;
- copy mock data as business truth;
- treat demo names, dates, progress or messages as fixed requirements.

Codex should rebuild production UI as maintainable React components.