import { Icon } from "./Icons";

export interface TabView {
  id: string;
  name: string;
  dirty: boolean;
  codexPending?: boolean;
}

interface EditorTabsProps {
  tabs: TabView[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function EditorTabs({ tabs, activeId, onActivate, onClose }: EditorTabsProps) {
  return (
    <div className="editor-tabs" role="tablist" aria-label="開いているファイル">
      {tabs.map((tab) => (
        <button
          className={`editor-tab${tab.id === activeId ? " active" : ""}`}
          key={tab.id}
          onClick={() => onActivate(tab.id)}
          role="tab"
          aria-selected={tab.id === activeId}
          title={tab.name}
        >
          <Icon name="file" />
          <span>{tab.name}</span>
          {tab.codexPending && <span className="codex-review-marker" aria-label="Codexの変更・未確認">AI</span>}
          {tab.dirty && <span className="dirty-dot" aria-label="未保存" />}
          <span
            className="tab-close"
            role="button"
            tabIndex={0}
            aria-label={`${tab.name} を閉じる`}
            onClick={(event) => {
              event.stopPropagation();
              onClose(tab.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onClose(tab.id);
            }}
          >
            <Icon name="close" />
          </span>
        </button>
      ))}
    </div>
  );
}
