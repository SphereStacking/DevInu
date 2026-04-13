FROM node:22-slim

# システムパッケージ
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# gh CLI インストール
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) \
         signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] \
         https://cli.github.com/packages stable main" \
      | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI インストール
RUN npm install -g @anthropic-ai/claude-code

# 非 root ユーザー作成（Claude Code が root での bypassPermissions を拒否するため）
RUN useradd -m -s /bin/bash chollows
RUN mkdir -p /chollows-plugin /workspace && chown -R chollows:chollows /chollows-plugin /workspace

# plugin を固定パスに配置
COPY --chown=chollows:chollows plugins/chollows/ /chollows-plugin/

# entrypoint
COPY --chown=chollows:chollows entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER chollows

ENTRYPOINT ["/entrypoint.sh"]
