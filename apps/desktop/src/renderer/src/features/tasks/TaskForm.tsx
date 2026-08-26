import { useState } from 'react';
import type { TaskPriority } from '@enterprise-brain/contracts';
import type { TaskInput } from '../../../../shared/enterprise-brain.js';
import { toTaskInput } from './task-input.js';

export function TaskForm({
  onSubmit
}: {
  onSubmit: (input: TaskInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('P2');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [deadline, setDeadline] = useState('');
  return (
    <form
      className="form task-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) {
          void onSubmit(
            toTaskInput({
              title,
              description,
              priority,
              acceptanceCriteria,
              deadline
            })
          );
          setTitle('');
          setDescription('');
          setPriority('P2');
          setAcceptanceCriteria('');
          setDeadline('');
        }
      }}
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="任务标题"
        required
      />
      <input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="说明（可选）"
      />
      <select
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskPriority)}
      >
        {(['P0', 'P1', 'P2', 'P3'] as const).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <textarea
        value={acceptanceCriteria}
        onChange={(event) => setAcceptanceCriteria(event.target.value)}
        placeholder="验收标准（可选，每行一条）"
      />
      <input
        type="datetime-local"
        value={deadline}
        onChange={(event) => setDeadline(event.target.value)}
        aria-label="截止时间"
      />
      <button className="primary">创建任务</button>
    </form>
  );
}
