import * as https from 'https';

https.get('https://t.me/s/senioritas_bdsm/553', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
     // match all message blocks
     const regex = /data-post="senioritas_bdsm\/(\d+)"[^>]*>.*?<div class="tgme_widget_message_text[^>]*>(.*?)<\/div>/gs;
     let match;
     while ((match = regex.exec(data)) !== null) {
        if (match[1] === '553') {
           console.log("POST 553 TEXT:", match[2].substring(0, 100));
        }
     }
     console.log("Done");
  });
});
