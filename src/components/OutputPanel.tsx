import { Icon } from "./Icons";

interface OutputPanelProps {
  lines: string[];
  collapsed: boolean;
  height: number;
  onToggle: () => void;
  onClear: () => void;
  onResizeStart: (event: React.PointerEvent) => void;
}

export function OutputPanel({ lines, collapsed, height, onToggle, onClear, onResizeStart }: OutputPanelProps) {
  return (
    <section className={`output-panel${collapsed ? " collapsed" : ""}`} style={collapsed ? undefined : { height }} aria-label="実行出力">
      {!collapsed && <div className="horizontal-resizer" onPointerDown={onResizeStart} />}
      <header className="panel-header output-header">
        <div className="panel-title"><Icon name="terminal" />出力</div>
        <div className="panel-actions">
          <button className="text-button" onClick={onClear} disabled={!lines.length}>クリア</button>
          <button className="icon-button" onClick={onToggle} aria-label={collapsed ? "出力を展開" : "出力を折りたたむ"}>
            <Icon name="chevron" className={collapsed ? "chevron-up" : ""} />
          </button>
        </div>
      </header>
      {!collapsed && (
        <div className="output-content" role="log" aria-live="polite">
          {lines.length ? lines.map((line, index) => <div className="output-line" key={`${index}-${line.slice(0, 20)}`}>{line}</div>) : <div className="empty-note">実行出力はここに表示されます。</div>}
        </div>
      )}
    </section>
  );
}
