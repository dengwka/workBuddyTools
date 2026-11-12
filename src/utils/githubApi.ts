import { GitHubUser, GitHubRepo, ProjectFile } from '../types';

export class GitHubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

export async function verifyGitHubToken(token: string): Promise<GitHubUser> {
  const cleanToken = token.trim();
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new GitHubApiError('Token 无效或已过期，请检查 Token 权限 (401 Unauthorized)', 401);
    }
    const err = await res.json().catch(() => ({}));
    throw new GitHubApiError(err.message || `验证失败: HTTP ${res.status}`, res.status);
  }

  return res.json();
}

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const cleanToken = token.trim();
  const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator', {
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!res.ok) {
    throw new GitHubApiError(`获取仓库列表失败: HTTP ${res.status}`, res.status);
  }

  return res.json();
}

export async function createNewRepo(
  token: string,
  repoName: string,
  description: string,
  isPrivate: boolean
): Promise<GitHubRepo> {
  const cleanToken = token.trim();
  const res = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName.trim(),
      description: description.trim(),
      private: isPrivate,
      auto_init: true, // create initial commit with README so branch exists
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new GitHubApiError(err.message || `创建仓库失败: HTTP ${res.status}`, res.status);
  }

  return res.json();
}

// Convert string to base64 safely supporting UTF-8 Chinese characters
function utf8ToBase64(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function toSolidBytes(_match, p1) {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
}

export async function pushFilesToGitHub(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: ProjectFile[],
  commitMessage: string,
  onProgress?: (step: string, current: number, total: number) => void
): Promise<{ commitSha: string; commitUrl: string }> {
  const cleanToken = token.trim();
  const headers = {
    Authorization: `Bearer ${cleanToken}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  onProgress?.('检查目标仓库和分支...', 0, files.length);

  // 1. Get branch reference
  let parentCommitSha: string | null = null;
  let baseTreeSha: string | null = null;

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, {
    headers,
  });

  if (refRes.ok) {
    const refData = await refRes.json();
    parentCommitSha = refData.object.sha;

    // Get commit details to get tree sha
    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, {
      headers,
    });
    if (commitRes.ok) {
      const commitData = await commitRes.json();
      baseTreeSha = commitData.tree.sha;
    }
  } else if (refRes.status === 404) {
    // Branch doesn't exist, check default branch or create initial
    const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoInfoRes.ok) {
      throw new GitHubApiError(`仓库 ${owner}/${repo} 未找到或无权限访问`, repoInfoRes.status);
    }
  }

  // 2. Upload blobs for files
  const treeEntries: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    sha: string;
  }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`上传文件 [${i + 1}/${files.length}]: ${file.path}`, i + 1, files.length);

    const base64Content = utf8ToBase64(file.content);
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: base64Content,
        encoding: 'base64',
      }),
    });

    if (!blobRes.ok) {
      const err = await blobRes.json().catch(() => ({}));
      throw new GitHubApiError(`上传文件 ${file.path} 失败: ${err.message || blobRes.status}`, blobRes.status);
    }

    const blobData = await blobRes.json();
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
  }

  onProgress?.('构建 Git 树 (Tree)...', files.length, files.length);

  // 3. Create tree
  const treeBody: Record<string, unknown> = {
    tree: treeEntries,
  };
  if (baseTreeSha) {
    treeBody.base_tree = baseTreeSha;
  }

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify(treeBody),
  });

  if (!treeRes.ok) {
    const err = await treeRes.json().catch(() => ({}));
    throw new GitHubApiError(`创建 Git 树失败: ${err.message || treeRes.status}`, treeRes.status);
  }

  const treeData = await treeRes.json();

  onProgress?.('创建 Commit 提交记录...', files.length, files.length);

  // 4. Create commit
  const commitPayload: Record<string, unknown> = {
    message: commitMessage || 'feat: auto-upload code from DevTool Workspace',
    tree: treeData.sha,
    parents: parentCommitSha ? [parentCommitSha] : [],
  };

  const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify(commitPayload),
  });

  if (!newCommitRes.ok) {
    const err = await newCommitRes.json().catch(() => ({}));
    throw new GitHubApiError(`创建 Commit 失败: ${err.message || newCommitRes.status}`, newCommitRes.status);
  }

  const newCommitData = await newCommitRes.json();

  onProgress?.(`更新分支 ${branch}...`, files.length, files.length);

  // 5. Update or create ref
  if (parentCommitSha) {
    const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: newCommitData.sha,
        force: false,
      }),
    });
    if (!updateRefRes.ok) {
      const err = await updateRefRes.json().catch(() => ({}));
      throw new GitHubApiError(`更新分支引用失败: ${err.message || updateRefRes.status}`, updateRefRes.status);
    }
  } else {
    // Create new ref
    const createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: newCommitData.sha,
      }),
    });
    if (!createRefRes.ok) {
      const err = await createRefRes.json().catch(() => ({}));
      throw new GitHubApiError(`创建分支引用失败: ${err.message || createRefRes.status}`, createRefRes.status);
    }
  }

  return {
    commitSha: newCommitData.sha,
    commitUrl: `https://github.com/owner/repo/commit/${newCommitData.sha}`.replace('owner/repo', `${owner}/${repo}`),
  };
}
