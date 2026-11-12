import React, { useState } from 'react';
import { FileCode, FolderTree, Copy, Check, Download, FileText, FileSpreadsheet } from 'lucide-react';
import { CURRENT_PROJECT_FILES, downloadProjectZip } from '../utils/projectFiles';
import { ProjectFile } from '../types';

export const CodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<ProjectFile>(CURRENT_PROJECT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSingleFile = (file: ProjectFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'file.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleZipDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadProjectZip();
    } finally {
      setIsDownloading(false);
    }
  };

  const getFileIcon = (path: string) => {
    if (path.endsWith('.json')) return <FileSpreadsheet className="w-4 h-4 text-amber-400" />;
    if (path.endsWith('.md')) return <FileText className="w-4 h-4 text-blue-400" />;
    return <FileCode className="w-4 h-4 text-indigo-400" />;
  };

  const lineCount = selectedFile.content.split('\n').length;
  const byteCount = new Blob([selectedFile.content]).size;

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 px-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/40">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
            <FolderTree className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">工程代码文件浏览器</h3>
            <p className="text-xs text-slate-400">将随项目自动上传至你的 GitHub 仓库的全部文件清单</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZipDownload}
            disabled={isDownloading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>打包 ZIP</span>
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
        {/* Left: Files List (4 cols) */}
        <div className="md:col-span-4 border-r border-slate-800 bg-slate-950/60 p-3 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 px-3 py-1.5 uppercase tracking-wider">
            待推送文件 ({CURRENT_PROJECT_FILES.length})
          </div>
          <div className="space-y-0.5">
            {CURRENT_PROJECT_FILES.map((file) => {
              const isSelected = selectedFile.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    {getFileIcon(file.path)}
                    <span className="font-mono truncate">{file.path}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {file.content.split('\n').length} lines
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Code Preview (8 cols) */}
        <div className="md:col-span-8 flex flex-col bg-slate-950">
          {/* File Tab Bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              {getFileIcon(selectedFile.path)}
              <span className="text-xs font-mono font-medium text-slate-200">{selectedFile.path}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({lineCount} 行 • {(byteCount / 1024).toFixed(1)} KB)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => downloadSingleFile(selectedFile)}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                title="单独下载此文件"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={copyCode}
                className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg text-xs flex items-center gap-1 transition-colors"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? '已复制' : '复制全文'}</span>
              </button>
            </div>
          </div>

          {/* Code block with line numbers */}
          <div className="p-4 overflow-auto flex-1 max-h-[550px] font-mono text-xs leading-relaxed">
            <pre className="text-slate-300 selection:bg-indigo-500/30">
              {selectedFile.content.split('\n').map((line, idx) => (
                <div key={idx} className="table-row">
                  <span className="table-cell select-none pr-4 text-right text-slate-600 text-[11px] font-mono">
                    {idx + 1}
                  </span>
                  <span className="table-cell whitespace-pre">{line}</span>
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
