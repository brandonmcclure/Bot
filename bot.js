import fetch from 'node-fetch';
import getPixels from "get-pixels";
import WebSocket from 'ws';
import ndarray from "ndarray";

const args = process.argv.slice(2);

if (args.length != 1 && !process.env.ACCESS_TOKEN) {
    console.error("Missing access token.")
    process.exit(1);
}

let accessToken = process.env.ACCESS_TOKEN || args[0];

var socket;
var hasOrders = false;
var currentOrders;

var order = [];
for (var i = 0; i < 2000000; i++) {
    order.push(i);
}
order.sort(() => Math.random() - 0.5);


const COLOR_MAPPINGS = {
	'#BE0039': 1,
    '#FF4500': 2,
    '#FFA800': 3,
    '#FFD635': 4,
    '#00A368': 6,
    '#00CC78': 7,
    '#7EED56': 8,
    '#00756F': 9,
    '#009EAA': 10,
    '#2450A4': 12,
    '#3690EA': 13,
    '#51E9F4': 14,
    '#493AC1': 15,
    '#6A5CFF': 16,
    '#811E9F': 18,
    '#B44AC0': 19,
    '#FF3881': 22,
    '#FF99AA': 23,
    '#6D482F': 24,
    '#9C6926': 25,
    '#000000': 27,
    '#898D90': 29,
    '#D4D7D9': 30,
    '#FFFFFF': 31
};

(async function () {
	connectSocket();
    attemptPlace();

    setInterval(() => {
        if (socket) socket.send(JSON.stringify({ type: 'ping' }));
    }, 5000);
})();

function connectSocket() {
    console.log('Verbinden met fuckcars server...')

    socket = new WebSocket('wss://fuckcars.noahvdaa.me/api/ws');

    socket.onerror = function(e) {
        console.error("Socket error: " + e.message)
    }

    socket.onopen = function () {
        console.log('Verbonden met fuckcars server!')
        socket.send(JSON.stringify({ type: 'getmap' }));
    };

    socket.onmessage = async function (message) {
        var data;
        try {
            data = JSON.parse(message.data);
        } catch (e) {
            return;
        }

        switch (data.type.toLowerCase()) {
            case 'map':
                console.log(`Nieuwe map geladen (reden: ${data.reason ? data.reason : 'verbonden met server'})`)
                currentOrders = await getMapFromUrl(`https://fuckcars.noahvdaa.me/maps/${data.data}`);
                hasOrders = true;
                break;
            default:
                break;
        }
    };

    socket.onclose = function (e) {
        console.warn(`fuckcars server heeft de verbinding verbroken: ${e.reason}`)
        console.error('Socketfout: ', e.reason);
        socket.close();
        setTimeout(connectSocket, 1000);
    };
}

async function attemptPlace() {
    if (!hasOrders) {
        setTimeout(attemptPlace, 2000); // probeer opnieuw in 2sec.
        return;
    }
    
    var map0;
    var map1;
    try {
        map0 = await getMapFromUrl(await getCurrentImageUrl('0'))
        map1 = await getMapFromUrl(await getCurrentImageUrl('1'));
    } catch (e) {
        console.warn('Fout bij ophalen map: ', e);
        setTimeout(attemptPlace, 15000); // probeer opnieuw in 15sec.
        return;
    }

    const rgbaOrder = currentOrders.data;
    const rgbaCanvas = [].concat(map0.data, map1.data);

    for (const i of order) {
        // negeer lege order pixels.
        if (rgbaOrder[(i * 4) + 3] === 0) continue;

        const hex = rgbToHex(rgbaOrder[(i * 4)], rgbaOrder[(i * 4) + 1], rgbaOrder[(i * 4) + 2]);
        // Deze pixel klopt.
        if (hex === rgbToHex(rgbaCanvas[(i * 4)], rgbaCanvas[(i * 4) + 1], rgbaCanvas[(i * 4) + 2])) continue;

        const x = i % 2000;
        const y = Math.floor(i / 2000);
        console.log(`Pixel proberen te plaatsen op ${x}, ${y}...`)

        const res = await place(x, y, COLOR_MAPPINGS[hex]);
        const data = await res.json();
        try {
            if (data.errors) {
                const error = data.errors[0];
                const nextPixel = error.extensions.nextAvailablePixelTs + 3000;
                const nextPixelDate = new Date(nextPixel);
                const delay = nextPixelDate.getTime() - Date.now();
                console.log(`Pixel te snel geplaatst! Volgende pixel wordt geplaatst om ${nextPixelDate.toLocaleTimeString()}.`)
                setTimeout(attemptPlace, delay);
            } else {
                const nextPixel = data.data.act.data[0].data.nextAvailablePixelTimestamp + 3000;
                const nextPixelDate = new Date(nextPixel);
                const delay = nextPixelDate.getTime() - Date.now();
                console.log(`Pixel geplaatst op ${x}, ${y}! Volgende pixel wordt geplaatst om ${nextPixelDate.toLocaleTimeString()}.`)
                setTimeout(attemptPlace, delay);
            }
        } catch (e) {
            console.warn('Fout bij response analyseren', e);
            setTimeout(attemptPlace, 10000);
        }

        return;
    }

    console.log(`Alle pixels staan al op de goede plaats! Opnieuw proberen in 30 sec...`)
    setTimeout(attemptPlace, 30000); // probeer opnieuw in 30sec.
}

function place(x, y, color) {
    socket.send(JSON.stringify({ type: 'placepixel', x, y, color }));
    console.log("Placing pixel at (" + x + ", " + y + ") with color: " + color)
	return fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x % 1000,
							'y': y % 1000
						},
						'colorIndex': color,
						'canvasIndex': (x > 999 ? 1 : 0)
					}
				}
			},
			'query': 'mutation setPixel($input: ActInput!) {\n  act(input: $input) {\n    data {\n      ... on BasicMessage {\n        id\n        data {\n          ... on GetUserCooldownResponseMessageData {\n            nextAvailablePixelTimestamp\n            __typename\n          }\n          ... on SetPixelResponseMessageData {\n            timestamp\n            __typename\n          }\n          __typename\n        }\n        __typename\n      }\n      __typename\n    }\n    __typename\n  }\n}\n'
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
}

async function getCurrentImageUrl(id = '0') {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws', {
        headers : {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:98.0) Gecko/20100101 Firefox/98.0",
            "Origin": "https://hot-potato.reddit.com"
        }
      });

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));

			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': id
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': 'subscription replace($input: SubscribeInput!) {\n  subscribe(input: $input) {\n    id\n    ... on BasicMessage {\n      data {\n        __typename\n        ... on FullFrameMessageData {\n          __typename\n          name\n          timestamp\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}'
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			// TODO: ew
			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name + `?noCache=${Date.now() * Math.random()}`);
		}


		ws.onerror = reject;
	});
}

function getMapFromUrl(url) {
    return new Promise((resolve, reject) => {
        getPixels(url, function(err, pixels) {
            if(err) {
                console.log("Bad image path")
                reject()
                return
            }
            console.log("got pixels", pixels.shape.slice())
            resolve(pixels)
        })
    });
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
