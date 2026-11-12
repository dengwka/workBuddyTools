import React, { useState } from 'react';
import {
  Code2,
  Wand2,
  Binary,
  Regex,
  Palette,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Clock,
  Layers,
} from 'lucide-react';

interface ToolPlaygroundProps {
  onSelectPromptTemplate: (prompt: string) => void;
}

export const ToolPlayground: React.FC<ToolPlaygroundProps> = ({ onSelectPromptTemplate }) => {
  const [activeTab, setActiveTab] = useState<'demo-tools' | 'custom-ideas'>('demo-tools');

  // Subtool selection
  const [subTool, setSubTool] = useState<'json' | 'base64' | 'regex' | 'timestamp'>('json');

  // JSON Tool State
  const [jsonInput, setJsonInput] = useState('{\n  "tool": "My Dev Utility",\n  "version": 1,\n  "readyForGithub": true,\n  "features": ["auto-sync", "zip-export", "instant-build"]\n}');
  const [jsonOutput, setJsonOutput] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Base64 / Hash State
  const [textInput, setTextInput] = useState('Hello, GitHub & AI Studio!');
  const [encodedBase64, setEncodedBase64] = useState('');

  // Regex State
  const [regexPattern, setRegexPattern] = useState('[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}');
  const [regexFlags, setRegexFlags] = useState('g');
  const [regexTestText, setRegexTestText] = useState('Contact us at support@example.com or dengwenkan@gmail.com for help.');
  const [regexMatches, setRegexMatches] = useState<string[]>([]);

  // Timestamp State
  const [timestampNow] = useState<number>(Date.now());
  const [tsInput, setTsInput] = useState<string>(Math.floor(Date.now() / 1000).toString());

  const [copied, setCopied] = useState(false);

  // Format JSON
  const formatJson = (minify = false) => {
    try {
      const parsed = JSON.parse(jsonInput);
      setJsonOutput(minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err: unknown) {
      setJsonError(err instanceof Error ? err.message : 'JSON 格式解析错误');
    }
  };

  // Base64 conversion
  const handleBase64Encode = () => {
    try {
      setEncodedBase64(btoa(unescape(encodeURIComponent(textInput))));
    } catch {
      setEncodedBase64('编码失败');
    }
  };
  const handleBase64Decode = () => {
    try {
      setTextInput(decodeURIComponent(escape(atob(encodedBase64))));
    } catch {
      setTextInput('解码失败：输入的 Base64 不合法');
    }
  };

  // Regex test
  const handleTestRegex = () => {
    try {
      const re = new RegExp(regexPattern, regexFlags);
      const matches = regexTestText.match(re);
      setRegexMatches(matches ? Array.from(matches) : []);
    } catch {
      setRegexMatches([]);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toolTemplates = [
    {
      title: '图片压缩与格式转换工具',
      desc: '支持纯前端压缩 PNG/JPG/WebP，调节画质比例，并支持批量打包下载',
      prompt: '请帮我做一个小工具：支持纯前端图片压缩与格式互转（PNG、JPEG、WebP），可以调节压缩质量与缩放比例，并支持多图批量处理和一键下载压缩包。',
    },
    {
      title: 'Markdown 在线实时转 HTML / PDF / 微信排版',
      desc: '双栏实时预览，带有语法高亮、代码块一键复制与一键导出排版',
      prompt: '请帮我做一个小工具：实时的 Markdown 在线编辑器与微信排版渲染工具，左侧输入 Markdown，右侧高颜值渲染预览，支持一键复制代码和导出 HTML。',
    },
    {
      title: 'REST / GraphQL API 调试与请求模拟器',
      desc: '支持自定义 Headers、请求参数、历史记录与 Response 耗时统计',
      prompt: '请帮我做一个类似 Postman 的轻量级 REST API 调试工具，支持 GET/POST/PUT/DELETE 请求、自定义 Headers、Query 参数、JSON 请求体和响应耗时格式化高亮。',
    },
    {
      title: '二维码 (QR Code) 与条形码批量生成器',
      desc: '自定义颜色、Logo 水印、尺寸大小与批量导出 PNG / SVG',
      prompt: '请帮我做一个功能强大的二维码与条形码生成工具，支持文本、网址、Wi-Fi 配置生成二维码，支持自定义前景色/背景色、内嵌 Logo 图标并高清导出。',
    },
    {
      title: '全能颜色调色板与无障碍对比度工具',
      desc: 'HEX/RGB/HSL 互转，自动提取渐变色，WCAG 无障碍可读性评分',
      prompt: '请帮我做一个设计师与前端开发用的调色板工具，支持取色、配色方案推荐（互补色、类似色）、Tailwind 色阶生成，以及 WCAG 文本对比度评分。',
    },
    {
      title: 'SQL / JSON / TypeScript 类型互转工具',
      desc: '输入 JSON 数据自动生成 TypeScript 接口定义或 SQL 表结构',
      prompt: '请帮我做一个开发工具：粘贴任意 JSON 数据，自动生成 TypeScript Interface 定义、以及 PostgreSQL / MySQL 建表 DDL 语句，支持自定义类型名和字段选项。',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Selector Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Wand2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm">小工具定制与功能体验中心</h3>
            <p className="text-xs text-slate-400">
              当前展示了开箱即用的实用示例；告诉我你的任何新需求，我将立即为你把整套工具编写完成！
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setActiveTab('demo-tools')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'demo-tools'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            内置即用小工具
          </button>
          <button
            onClick={() => setActiveTab('custom-ideas')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'custom-ideas'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            挑选定制灵感模版
          </button>
        </div>
      </div>

      {activeTab === 'demo-tools' ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          {/* Sub Navigation */}
          <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-800">
            <button
              onClick={() => setSubTool('json')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                subTool === 'json'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>JSON 格式化与校验</span>
            </button>
            <button
              onClick={() => setSubTool('base64')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                subTool === 'base64'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Binary className="w-3.5 h-3.5" />
              <span>Base64 编解码</span>
            </button>
            <button
              onClick={() => {
                setSubTool('regex');
                handleTestRegex();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                subTool === 'regex'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Regex className="w-3.5 h-3.5" />
              <span>正则表达式匹配</span>
            </button>
            <button
              onClick={() => setSubTool('timestamp')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                subTool === 'timestamp'
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>时间戳转换</span>
            </button>
          </div>

          {/* SubTool 1: JSON */}
          {subTool === 'json' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">输入 JSON 内容进行格式化与语法检测：</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => formatJson(false)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    美化格式 (Prettify)
                  </button>
                  <button
                    onClick={() => formatJson(true)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
                  >
                    压缩单行 (Minify)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    className="w-full h-64 bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 resize-none"
                    placeholder="在此粘贴原始 JSON 文本..."
                  />
                  {jsonError && (
                    <div className="mt-2 p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
                      {jsonError}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <pre className="w-full h-64 bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-400 overflow-auto whitespace-pre">
                    {jsonOutput || '// 格式化后的结果将显示在这里\n// 点击上方“美化格式”按钮执行'}
                  </pre>
                  {jsonOutput && (
                    <button
                      onClick={() => copyToClipboard(jsonOutput)}
                      className="absolute right-3 top-3 px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? '已复制' : '复制'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SubTool 2: Base64 */}
          {subTool === 'base64' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-medium">明文文本 (UTF-8)</label>
                  <textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="w-full h-48 bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleBase64Encode}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <span>编码为 Base64 &rarr;</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-medium">Base64 密文</label>
                  <textarea
                    value={encodedBase64}
                    onChange={(e) => setEncodedBase64(e.target.value)}
                    placeholder="在此输入 Base64 字符串以进行解码..."
                    className="w-full h-48 bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-emerald-300 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBase64Decode}
                      className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
                    >
                      <span>&larr; 解码回明文</span>
                    </button>
                    {encodedBase64 && (
                      <button
                        onClick={() => copyToClipboard(encodedBase64)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg flex items-center gap-1 transition-colors"
                      >
                        {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>复制结果</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SubTool 3: Regex */}
          {subTool === 'regex' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3">
                  <label className="text-xs text-slate-300 font-medium block mb-1">正则表达式 (RegExp Pattern)</label>
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1">修饰符 (Flags)</label>
                  <input
                    type="text"
                    value={regexFlags}
                    onChange={(e) => setRegexFlags(e.target.value)}
                    placeholder="g, i, m"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">待测试文本</label>
                <textarea
                  value={regexTestText}
                  onChange={(e) => setRegexTestText(e.target.value)}
                  className="w-full h-24 bg-slate-950 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestRegex}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>执行匹配匹配</span>
                </button>
                <span className="text-xs text-slate-400">
                  找到 <strong className="text-emerald-400">{regexMatches.length}</strong> 处匹配项
                </span>
              </div>

              {regexMatches.length > 0 && (
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-xs font-medium text-slate-400">匹配列表：</span>
                  <div className="flex flex-wrap gap-2">
                    {regexMatches.map((m, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs rounded-lg"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SubTool 4: Timestamp */}
          {subTool === 'timestamp' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400">当前 UNIX 时间戳 (毫秒 / 秒)：</span>
                  <div className="text-lg font-mono font-bold text-indigo-400 mt-0.5">
                    {timestampNow} <span className="text-xs text-slate-400 font-normal">({Math.floor(timestampNow / 1000)}s)</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">当前北京时间：</span>
                  <div className="text-sm font-mono text-slate-200 mt-0.5">
                    {new Date(timestampNow).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300 font-medium">输入时间戳进行反解析 (支持 10 位秒或 13 位毫秒)：</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={tsInput}
                    onChange={(e) => setTsInput(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-3 py-2 rounded-xl border border-emerald-800/40">
                    {(() => {
                      const num = Number(tsInput);
                      if (isNaN(num)) return '非法时间戳';
                      const ms = tsInput.length === 10 ? num * 1000 : num;
                      return new Date(ms).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Custom Ideas Tab */
        <div className="space-y-4">
          <div className="p-4 bg-indigo-950/30 border border-indigo-900/50 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <div>
                <h4 className="font-semibold text-slate-200 text-sm">选择下方灵感模版，或直接告诉我你的工具想法</h4>
                <p className="text-xs text-slate-400">点击任意卡片即可复制提示词，在聊天中发送给我，我将立即为你构建！</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {toolTemplates.map((item, index) => (
              <div
                key={index}
                className="bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 space-y-3 transition-all hover:shadow-lg hover:shadow-indigo-900/20 flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                      Template #{index + 1}
                    </span>
                    <Layers className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                  </div>
                  <h4 className="font-semibold text-slate-100 text-sm mt-2.5 group-hover:text-indigo-300 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <button
                  onClick={() => onSelectPromptTemplate(item.prompt)}
                  className="w-full py-2 bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-medium rounded-xl border border-slate-700/80 hover:border-indigo-500 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>选择此需求模版</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
