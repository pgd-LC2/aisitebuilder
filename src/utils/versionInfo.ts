interface VersionInfo {
  context: string;
  pr: string | null;
  sha: string | null;
  deployUrl: string | null;
  deployPrimeUrl: string | null;
  builtAt: string;
}

export async function logVersionInfo(): Promise<void> {
  try {
    const res = await fetch("/version.json", { cache: "no-store" });
    if (!res.ok) {
      return;
    }
    const info: VersionInfo = await res.json();

    const lines: string[] = [];
    lines.push("=== AI Site Builder 版本信息 ===");

    if (info.pr) {
      lines.push(`PR: #${info.pr}`);
    }

    if (info.sha) {
      lines.push(`Commit: ${info.sha}`);
    }

    lines.push(`环境: ${info.context}`);
    lines.push(`构建时间: ${info.builtAt}`);

    if (info.deployUrl) {
      lines.push(`部署 URL: ${info.deployUrl}`);
    }

    lines.push("================================");

    console.log(lines.join("\n"));
  } catch {
    // version.json 不存在时静默失败（本地开发环境）
  }
}
