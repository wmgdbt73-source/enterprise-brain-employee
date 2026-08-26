import { useEffect, useState } from 'react';
import type {
  DesktopApiError,
  DirectoryListing,
  TextFile,
  WorkspaceBindingView
} from '../../../../shared/enterprise-brain.js';
import { resolveOperation } from '../runtime/operation-state.js';

function message(error: DesktopApiError): string {
  return error.message;
}

export function WorkspacePanel({ projectId }: { projectId: string }) {
  const [binding, setBinding] = useState<WorkspaceBindingView | null>();
  const [listing, setListing] = useState<DirectoryListing>();
  const [file, setFile] = useState<TextFile>();
  const [error, setError] = useState<DesktopApiError>();
  const load = async () => {
    const result = resolveOperation(
      await window.enterpriseBrain.workspace.get(projectId)
    );
    setError(result.error);
    setBinding(result.data);
    setListing(undefined);
    setFile(undefined);
    if (result.data) await browse('');
  };
  const browse = async (relativePath: string) => {
    const result = resolveOperation(
      await window.enterpriseBrain.workspace.listDirectory(
        projectId,
        relativePath
      )
    );
    if (result.error) return setError(result.error);
    setError(undefined);
    setListing(result.data);
    setFile(undefined);
  };
  useEffect(() => {
    void load();
  }, [projectId]);
  async function select() {
    const result = resolveOperation(
      await window.enterpriseBrain.workspace.select(projectId)
    );
    if (result.error) return setError(result.error);
    setError(undefined);
    if (result.data?.binding) {
      setBinding(result.data.binding);
      await browse('');
    }
  }
  async function unbind() {
    const result = resolveOperation(
      await window.enterpriseBrain.workspace.unbind(projectId)
    );
    if (result.error) return setError(result.error);
    setBinding(null);
    setListing(undefined);
    setFile(undefined);
    setError(undefined);
  }
  async function open(relativePath: string) {
    const result = resolveOperation(
      await window.enterpriseBrain.workspace.readFile(projectId, relativePath)
    );
    if (result.error) return setError(result.error);
    setError(undefined);
    setFile(result.data);
  }
  return (
    <section className="workspace-panel">
      <h2>本地工作区</h2>
      <p>
        权限：<strong>LOCAL_READ · 只读</strong>
      </p>
      {error && <p className="local-error">{message(error)}</p>}
      {binding ? (
        <>
          <p className="workspace-path">{binding.localPath}</p>
          <button onClick={() => void select()}>更换文件夹</button>
          <button onClick={() => void unbind()}>解除绑定</button>
          <div className="workspace-browser">
            <h3>文件</h3>
            {listing?.path ? (
              <button
                onClick={() =>
                  void browse(listing.path.split('/').slice(0, -1).join('/'))
                }
              >
                返回上级
              </button>
            ) : null}
            <ul>
              {listing?.entries.map((entry) => (
                <li key={entry.relativePath}>
                  <button
                    disabled={entry.kind === 'SYMLINK'}
                    onClick={() =>
                      void (entry.kind === 'DIRECTORY'
                        ? browse(entry.relativePath)
                        : open(entry.relativePath))
                    }
                  >
                    {entry.name} <small>{entry.kind}</small>
                  </button>
                </li>
              ))}
            </ul>
            {file && (
              <article>
                <h3>{file.relativePath}</h3>
                <pre>{file.content}</pre>
              </article>
            )}
          </div>
        </>
      ) : (
        <>
          <p>尚未绑定本地文件夹。选择后仅允许读取该文件夹内的文本文件。</p>
          <button onClick={() => void select()}>选择文件夹</button>
        </>
      )}
    </section>
  );
}
