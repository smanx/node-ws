const os = require('os');
const http = require('http');
const fs = require('fs');
const axios = require('axios');
const net = require('net');
const { Buffer } = require('buffer');
const { exec, execSync } = require('child_process');
const { WebSocket, createWebSocketStream } = require('ws');
const { v4: uuidv4 } = require('uuid');
const UPLOAD_URL = process.env.UPLOAD_URL || 'https://merge.smanx.dpdns.org';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.serv00.net
let UUID = process.env.UUID || uuidv4(); // 运行哪吒v1,在不同的平台需要改UUID,否则会被覆盖

const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nz1.smanx.dpdns.org:80';       // 哪吒v1填写形式：nz.abc.com:8008   哪吒v0填写形式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';           // 哪吒v1没有此变量，v0的agent端口为{443,8443,2096,2087,2083,2053}其中之一时开启tls
const NEZHA_KEY = process.env.NEZHA_KEY || 'rGRCD6bfowTP3J5mh29zK7EmxoaXUWb4';             // v1的NZ_CLIENT_SECRET或v0的agent端口                   
const DOMAIN = process.env.DOMAIN || 'DOMAIN.DOMAIN.DOMAIN';       // 填写项目域名或已反代的域名，不带前缀，建议填已反代的域名
const AUTO_ACCESS = process.env.AUTO_ACCESS || true;      // 是否开启自动访问保活,false为关闭,true为开启,需同时填写DOMAIN变量
const SUB_PATH = process.env.SUB_PATH || 'auto';            // 获取节点的订阅路径
const KEEP_PATH = process.env.SUB_PATH || 'keep';            // 保活路径
const NAME = process.env.NAME || 'Vls';                    // 节点名称
const PORT = process.env.PORT || 3000;                     // http和ws服务端口
const ADRESS = process.env.ADRESS || '104.16.0.0';

if (!fs.existsSync('uuid.txt')) {
  fs.writeFileSync('uuid.txt', UUID);
} else {
  UUID = fs.readFileSync('uuid.txt', 'utf8');
}

let ISP = '';
try {
  ISP = getISP()
} catch (e) {}
if (!ISP) {
  try {
    ISP = getISP2()
  } catch (error) {}
}
// console.log('ISP', ISP); return

function getISP() {
  const metaInfo = JSON.parse(execSync(
    'curl -s https://speed.cloudflare.com/meta',
    { encoding: 'utf-8' }
  ));
  const ISP = `${metaInfo.city}-${metaInfo.country}-${metaInfo.asOrganization}-${metaInfo.clientIp}`.replaceAll(' ', '_');
  return ISP
}
function getISP2() {
  const metaInfo = JSON.parse(execSync(
    'curl -s http://ip-api.com/json/',
    { encoding: 'utf-8' }
  ));
  const ISP = `${metaInfo.city}-${metaInfo.country}-${metaInfo.isp}-${metaInfo.query}`.replaceAll(' ', '_');
  return ISP
}

const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, World\n');
  } else if (req.url === `/${SUB_PATH}`) {
    const vlessURL = `vless://${UUID}@${ADRESS}:443?encryption=none&security=tls&sni=${DOMAIN}&type=ws&host=${DOMAIN}&path=%2F#${NAME}-${ISP}`;

    const base64Content = Buffer.from(vlessURL).toString('base64');

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(base64Content + '\n');
  } else if (req.url === `/${KEEP_PATH}`) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK\n');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\n');
  }
});

const wss = new WebSocket.Server({ server: httpServer });
const uuid = UUID.replace(/-/g, "");
wss.on('connection', ws => {
  // console.log("Connected successfully");
  ws.once('message', msg => {
    const [VERSION] = msg;
    const id = msg.slice(1, 17);
    if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;
    let i = msg.slice(17, 18).readUInt8() + 19;
    const port = msg.slice(i, i += 2).readUInt16BE(0);
    const ATYP = msg.slice(i, i += 1).readUInt8();
    const host = ATYP == 1 ? msg.slice(i, i += 4).join('.') :
      (ATYP == 2 ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8())) :
        (ATYP == 3 ? msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':') : ''));
    // console.log(`Connection from ${host}:${port}`);
    ws.send(new Uint8Array([VERSION, 0]));
    const duplex = createWebSocketStream(ws);
    net.connect({ host, port }, function () {
      this.write(msg.slice(i));
      duplex.on('error', () => { }).pipe(this).on('error', () => { }).pipe(duplex);
    }).on('error', () => { });
  }).on('error', () => { });
});

const getDownloadUrl = () => {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    if (!NEZHA_PORT) {
      return 'https://arm64.ssss.nyc.mn/v1';
    } else {
      return 'https://arm64.ssss.nyc.mn/agent';
    }
  } else {
    if (!NEZHA_PORT) {
      return 'https://amd64.ssss.nyc.mn/v1';
    } else {
      return 'https://amd64.ssss.nyc.mn/agent';
    }
  }
};

const downloadFile = async () => {
  try {
    const url = getDownloadUrl();
    // console.log(`Start downloading file from ${url}`);
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream('npm');
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        // console.log('npm download successfully');
        exec('chmod +x ./npm', (err) => {
          if (err) reject(err);
          resolve();
        });
      });
      writer.on('error', reject);
    });
  } catch (err) {
    throw err;
  }
};

const runnz = async () => {
  await downloadFile();
  let NEZHA_TLS = '';
  let command = '';

  // console.log(`NEZHA_SERVER: ${NEZHA_SERVER}`);


  const checkNpmRunning = () => {
    try {
      const result = execSync('ps aux | grep "npm" | grep -v "grep"').toString();
      return result.length > 0;
    } catch (error) {
      return false;
    }
  };

  if (checkNpmRunning()) {
    console.log('npm is already running');
    return;
  }

  if (NEZHA_SERVER && NEZHA_PORT && NEZHA_KEY) {
    const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
    NEZHA_TLS = tlsPorts.includes(NEZHA_PORT) ? '--tls' : '';
    // 移除 nohup，使用子 shell 和 disown 实现后台运行
    command = `(./npm -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} > npm0.log.txt 2>&1 & disown) &`;

  } else if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 检测哪吒是否开启TLS
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: false
ip_report_period: 1800
report_delay: 1
server: ${NEZHA_SERVER}
skip_connection_count: false
skip_procs_count: false
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

      if (!fs.existsSync('config.yaml')) {
        fs.writeFileSync('config.yaml', configYaml);
      }
    }
    command = `./npm -c config.yaml > ./npm1.log.txt  2>&1 &`;
  } else {
    console.log('NEZHA variable is empty, skip running');
    return;
  }

  try {
    const child = exec(command, {
      shell: '/bin/bash',
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    // console.log('npm is running');
  } catch (error) {
    console.error(`npm running error: ${error}`);
  }
};

async function addAccessTask() {
  if (!AUTO_ACCESS) return;
  try {
    if (!DOMAIN) {
      // console.log('URL is empty. Skip Adding Automatic Access Task');
      return;
    } else {
      const fullURL = `https://${DOMAIN}/${KEEP_PATH}`;
      const command = `curl -X POST "https://oooo.serv00.net/add-url" -H "Content-Type: application/json" -d '{"url": "${fullURL}"}'`;
      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error('Error sending request:', error.message);
          return;
        }
        // console.log('Automatic Access Task added successfully:', stdout);
      });
    }
  } catch (error) {
    console.error('Error added Task:', error.message);
  }
}

const delFiles = () => {
  fs.unlink('npm', () => { });
  fs.unlink('config.yaml', () => { });
};

// 自动上传节点或订阅
async function uplodNodes() {
  if (UPLOAD_URL) {
    const subscriptionUrl = `https://${DOMAIN}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
      const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        console.log('Subscription uploaded successfully');
      } else {
        return null;
        //  console.log('Unknown response status');
      }
    } catch (error) {
      if (error.response) {
        if (error.response.status === 400) {
          //  console.error('Subscription already exists');
        }
      }
    }
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

    if (nodes.length === 0) return;

    const jsonData = JSON.stringify({ nodes });

    try {
      await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (response.status === 200) {
        console.log('Subscription uploaded successfully');
      } else {
        return null;
      }
    } catch (error) {
      return null;
    }
  } else {
    // console.log('Skipping upload nodes');
    return;
  }
}

httpServer.listen(PORT, () => {
  runnz();
  // setTimeout(() => {
  //   delFiles();
  // }, 30000);
  addAccessTask();
  uplodNodes();
  console.log(`Server is running on port ${PORT}`);
});
