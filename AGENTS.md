# opencode插件仓库

**注意，本文档不允许主动编辑，需要批准**

opencode源码：~/ws/opencode

## 项目目录

install.sh:
    for cur_file_or_dir in [agents,skills] of
         project_root/src/cur_file_or_dir  -> /home/zhaocj/.config/opencode

src：
    - agents/  以skill为准，作为skill的agent方式调用
    - skills/  
    - AGENTS.md 
    - tools/  
    - plugins

参考文档：
    https://opencode.ai/docs/zh-cn/sdk/
    https://opencode.ai/docs/zh-cn/agents/#markdown
    https://opencode.ai/docs/zh-cn/skills/
    https://opencode.ai/docs/zh-cn/custom-tools/
    https://opencode.ai/docs/zh-cn/server/
    https://opencode.ai/docs/zh-cn/plugins/
    https://opencode.ai/docs/zh-cn/plugins/

## work方式:
1. read opencode source and 参考文档 first if anything not sure
2. when session done , insert change log in top of changelog.md 