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
RUN useradd -m -s /bin/bash devinu
RUN mkdir -p /devinu-plugin /workspace && chown -R devinu:devinu /devinu-plugin /workspace

# plugin を固定パスに配置
COPY --chown=devinu:devinu plugins/devinu/ /devinu-plugin/

# pr-review-toolkit プラグインを公式リポジトリから取得
RUN git clone --depth=1 https://github.com/anthropics/claude-plugins-official.git /tmp/claude-plugins-official \
    && cp -r /tmp/claude-plugins-official/plugins/pr-review-toolkit /pr-review-toolkit-plugin \
    && rm -rf /tmp/claude-plugins-official \
    && chown -R devinu:devinu /pr-review-toolkit-plugin

# entrypoint
COPY --chown=devinu:devinu entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER devinu

ENTRYPOINT ["/entrypoint.sh"]
