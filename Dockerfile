# 多阶段构建优化Dockerfile
# 构建阶段
FROM node:20-alpine3.20 AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装依赖
RUN npm ci && npm cache clean --force

# 复制源代码
COPY index.js index.html build.js ./

# 构建应用
RUN npm run build

# 运行阶段
FROM node:20-alpine3.20

WORKDIR /app

# 复制构建产物和必要文件
COPY --from=builder /app/dist/* ./

# 安装必要的系统工具
# RUN apk update && apk add --no-cache bash openssl curl

EXPOSE 7860

# 运行应用
CMD ["node", "bundle.obfuscated.js"]
