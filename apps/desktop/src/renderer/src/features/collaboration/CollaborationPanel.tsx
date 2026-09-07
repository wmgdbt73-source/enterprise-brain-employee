import { useEffect, useState } from 'react';
import type { DesktopApiError } from '../../../../shared/enterprise-brain.js';
import { ErrorState, State } from '../../components/State.js';
import type {
  ActionItemContract,
  ConversationContract,
  LibraryItemContract,
  MessageContract,
  NotificationContract,
  ReminderContract,
  SwarmEventContract
} from '@enterprise-brain/contracts';

type Mode = 'dynamic' | 'notifications' | 'library';
type FeedItem =
  ConversationContract | NotificationContract | LibraryItemContract;

export function CollaborationPanel({
  mode,
  projectId
}: {
  mode: Mode;
  projectId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DesktopApiError>();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<MessageContract[]>([]);
  const [draft, setDraft] = useState('');
  const load = async () => {
    setLoading(true);
    setError(undefined);
    const result = await (mode === 'notifications'
      ? window.enterpriseBrain.collaboration.notifications()
      : mode === 'library'
        ? window.enterpriseBrain.collaboration.library(
            projectId ? { scopeType: 'PROJECT', scopeId: projectId } : {}
          )
        : window.enterpriseBrain.collaboration.conversations(
            projectId ? { scopeType: 'PROJECT', scopeId: projectId } : {}
          ));
    if (result.ok) setItems(result.data.items);
    else setError(result.error);
    setLoading(false);
  };
  useEffect(() => {
    void load();
    setConversationId(undefined);
    setMessages([]);
  }, [mode, projectId]);
  async function openConversation(id: string) {
    setConversationId(id);
    setLoading(true);
    const result = await window.enterpriseBrain.collaboration.messages(id);
    if (result.ok) setMessages(result.data.items);
    else setError(result.error);
    setLoading(false);
  }
  async function send() {
    if (!conversationId || !draft.trim()) return;
    const result = await window.enterpriseBrain.collaboration.sendMessage(
      conversationId,
      { content: draft.trim(), idempotencyKey: crypto.randomUUID() }
    );
    if (result.ok) {
      setMessages((old) => [...old, result.data]);
      setDraft('');
    } else setError(result.error);
  }
  if (loading)
    return (
      <State
        title="正在加载协作信息…"
        text="正在读取当前权限范围内的协作数据。"
      />
    );
  if (error)
    return error.code === 'FORBIDDEN' || error.code === 'NOT_FOUND' ? (
      <State title="没有访问权限" text="此协作内容不可用，或你的权限已变更。" />
    ) : (
      <ErrorState error={error} retry={() => void load()} />
    );
  if (mode === 'notifications')
    return (
      <section className="collaboration notification-center">
        <p className="eyebrow">NOTIFICATION CENTER</p>
        <h1>通知</h1>
        {items.length ? (
          (items as NotificationContract[]).map((item) => (
            <article className="feed-item" key={item.notificationId}>
              <button
                className="text-button"
                onClick={() =>
                  void window.enterpriseBrain.collaboration
                    .markNotificationRead(item.notificationId, true)
                    .then(load)
                }
              >
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </button>
            </article>
          ))
        ) : (
          <State
            title="暂时没有通知"
            text="提及、任务状态和评审动态会显示在这里。"
          />
        )}
      </section>
    );
  if (mode === 'library')
    return (
      <section className="collaboration">
        <p className="eyebrow">LIBRARY</p>
        <h1>资料库</h1>
        {items.length ? (
          <div className="feed">
            {(items as LibraryItemContract[]).map((item) => (
              <article className="feed-item" key={item.libraryItemId}>
                <small>{item.type}</small>
                <h2>{item.title}</h2>
                <p>{item.summary || '已从正式工作流收集。'}</p>
              </article>
            ))}
          </div>
        ) : (
          <State
            title="资料库为空"
            text="工作产物与结果会在可访问时出现在这里。"
          />
        )}
      </section>
    );
  if (conversationId)
    return (
      <section className="collaboration">
        <button className="back" onClick={() => setConversationId(undefined)}>
          ← 返回
        </button>
        <p className="breadcrumb">
          <button onClick={() => setConversationId(undefined)}>动态</button> /
          对话
        </p>
        <h1>群聊</h1>
        <div className="message-list">
          {messages.length ? (
            messages.map((message) => (
              <article key={message.messageId} className="message">
                <strong>
                  {message.authorType === 'AGENT' ? 'Agent' : '成员'}
                </strong>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <State title="还没有消息" text="开始这段协作对话。" />
          )}
        </div>
        <div className="composer">
          <input
            aria-label="消息"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="输入消息；@ 可提及成员或 Agent"
          />
          <button className="primary" onClick={() => void send()}>
            发送
          </button>
        </div>
      </section>
    );
  return (
    <section className="collaboration">
      <p className="eyebrow">PROJECT DYNAMIC</p>
      <h1>动态</h1>
      <div className="dynamic-grid">
        <section>
          <h2>群聊</h2>
          {items.length ? (
            (items as ConversationContract[]).map((item) => (
              <button
                className="feed-item text-button"
                key={item.conversationId}
                onClick={() => void openConversation(item.conversationId)}
              >
                <strong>{item.title}</strong>
                <p>
                  {item.type === 'HUMAN_GROUP'
                    ? '人类协作群聊'
                    : '项目协作对话'}
                </p>
              </button>
            ))
          ) : (
            <State title="还没有群聊" text="可访问的项目群聊会显示在这里。" />
          )}
        </section>
        <Activity projectId={projectId} />
      </div>
      <WorkQueue />
    </section>
  );
}

function Activity({ projectId }: { projectId?: string }) {
  const [data, setData] = useState<SwarmEventContract[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    void window.enterpriseBrain.collaboration
      .swarmEvents('PROJECT', projectId)
      .then((result) =>
        result.ok ? setData(result.data.items) : setError(true)
      );
  }, [projectId]);
  return (
    <section>
      <h2>蜂群 / 项目活动</h2>
      {error ? (
        <p>活动暂不可用。</p>
      ) : data.length ? (
        data.map((event) => (
          <article className="feed-item" key={event.swarmEventId}>
            <strong>{event.title}</strong>
            <p>{event.summary}</p>
          </article>
        ))
      ) : (
        <p className="empty-inline">尚无项目活动。</p>
      )}
    </section>
  );
}

function WorkQueue() {
  const [actions, setActions] = useState<ActionItemContract[]>([]);
  const [reminders, setReminders] = useState<ReminderContract[]>([]);
  useEffect(() => {
    void Promise.all([
      window.enterpriseBrain.collaboration.actionItems(),
      window.enterpriseBrain.collaboration.reminders()
    ]).then(([actionResult, reminderResult]) => {
      if (actionResult.ok) setActions(actionResult.data);
      if (reminderResult.ok) setReminders(reminderResult.data.items);
    });
  }, []);
  return (
    <div className="dynamic-grid">
      <section>
        <h2>行动队列</h2>
        {actions.length ? (
          actions.map((item) => (
            <article className="feed-item" key={item.actionItemId}>
              <strong>{item.title}</strong>
              <p>{item.type}</p>
            </article>
          ))
        ) : (
          <p className="empty-inline">没有待处理事项。</p>
        )}
      </section>
      <section>
        <h2>提醒</h2>
        {reminders.length ? (
          reminders.map((item) => (
            <article className="feed-item" key={item.reminderId}>
              <strong>{item.title}</strong>
              <p>{new Date(item.dueAt).toLocaleString()}</p>
            </article>
          ))
        ) : (
          <p className="empty-inline">没有待办提醒。</p>
        )}
      </section>
    </div>
  );
}
