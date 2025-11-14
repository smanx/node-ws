// build.js

const esbuild = require('esbuild');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

// 定义入口和出口文件
const inputFile = 'index.js';
const tempFile = 'dist/bundle.temp.js'; // esbuild 打包后的临时文件
const finalFile = 'dist/bundle.obfuscated.js'; // 最终混淆后的文件

// esbuild 的构建选项
const esbuildOptions = {
    entryPoints: [inputFile],
    bundle: true,
    platform: 'node',
    outfile: tempFile,
};

// javascript-obfuscator 的混淆选项 (这里的配置可以非常复杂和强大)
const obfuscatorOptions = {
    compact: true, // 压缩代码
    controlFlowFlattening: true, // 控制流平坦化
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true, // 随机注入无效代码
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false, // 是否开启反调试
    debugProtectionInterval: 0,
    disableConsoleOutput: false, // 是否禁止 console 输出
    stringArray: true, // 将字符串移动到数组中
    stringArrayEncoding: ['base64'], // 字符串数组的编码方式
    stringArrayThreshold: 0.75,
    transformObjectKeys: true, // 转换对象键名
    renameGlobals: true, // 重命名全局变量和函数
};


async function buildAndObfuscate() {
    try {
        console.log('Step 1: Bundling with esbuild...');
        // 1. 使用 esbuild 打包，但不进行 minify，把这个任务交给 obfuscator
        await esbuild.build({ ...esbuildOptions, minify: false });
        console.log('esbuild bundling complete.');

        console.log('Step 2: Obfuscating bundled code...');
        // 2. 读取 esbuild 打包后的文件内容
        const bundledCode = fs.readFileSync(tempFile, 'utf8');

        console.log('Step 3: Performing obfuscation...');
        // 3. 使用 javascript-obfuscator 进行混淆
        const obfuscationResult = JavaScriptObfuscator.obfuscate(bundledCode, obfuscatorOptions);
        
        console.log('Obfuscation complete.');
        // 4. 获取混淆后的代码
        const obfuscatedCode = obfuscationResult.getObfuscatedCode();
        
        console.log('Step 4: Writing obfuscated code to final file...');
        // 5. 将最终代码写入文件
        fs.writeFileSync(finalFile, obfuscatedCode);
        console.log(`Obfuscation complete! Final file saved to ${finalFile}`);

        // 6. （可选）删除临时文件
        fs.unlinkSync(tempFile);

        // 7. 生成构建时间戳文件
        console.log('Step 5: Generating timestamp file...');
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const parts = formatter.formatToParts(now);
        const timestamp = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value} ${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}:${parts.find(p => p.type === 'second').value}`;
        
        // 确保dist目录存在
        if (!fs.existsSync('dist')) {
            fs.mkdirSync('dist');
        }
        
        const timestampFile = 'dist/build-time.txt';
        fs.writeFileSync(timestampFile, timestamp);
        console.log(`Timestamp file generated at ${timestampFile} with content: ${timestamp}`);

        // 把index.html复制到dist目录
        console.log('Step 6: Copying index.html to dist directory...');
        fs.copyFileSync('index.html', 'dist/index.html');
        console.log('index.html copied to dist directory.');

        console.log('Build and obfuscation process completed successfully!');

    } catch (error) {
        console.error('Build process failed:', error);
        process.exit(1);
    }
}

// 运行构建流程
buildAndObfuscate();
