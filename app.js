/* Compatibility check */
const userAgent = navigator.userAgent.toLowerCase();
console.log("Application is runnning on " + userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
const isCompatible = (/chrome|edg|opera/i.test(userAgent)) && !isSafari;
if (!isCompatible) {
  alert("Applications require Chrome, Edge or Opera web browsers");
}
const isMobile = /android|webos|iphone|ipad|ipod|blackBerry|iemobile|opera mini|mobile|crios/i.test(userAgent);
if (isMobile) {
    alert("USB is not available on mobile browsers");
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/*******************************************************************************
 * BLE connection and RX data handler
 ******************************************************************************/

/* Graphical components binding */
const connectBLEButton = document.querySelector('.app-ble-connect-button');
const connectBLEButtonRipple = new mdc.ripple.MDCRipple(connectBLEButton);
const connectBLEButtonLabel = document.querySelector('.app-ble-connect-button-label');
const connectBLEStatusIcon = document.querySelector('.app-ble-status-icon');

/* Global variables */
const UUIDS = {
    NRF_UART_SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    NRF_UART_TX_CHAR_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
    NRF_UART_RX_CHAR_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
};
const bleDeviceNamePrefix = "Stimul"
let bleDevice;
let bleConnected = false;


async function onConnectBLEButtonClick() {
    if (bleConnected == false) {
        disableAllButtons();
        connectBLEButtonLabel.innerHTML = 'Connecting...'
        let searchTimer = setInterval(
            function () {
                if (connectBLEStatusIcon.innerHTML == 'bluetooth_searching') {
                    connectBLEStatusIcon.innerHTML = 'bluetooth';
                }
                else {
                    connectBLEStatusIcon.innerHTML = 'bluetooth_searching';
                }
            },
            750
        );
        try {
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: bleDeviceNamePrefix },
                ],
                optionalServices: [UUIDS.NRF_UART_SERVICE_UUID, 'device_information', 'battery_service'],
            });
            bleDevice.addEventListener('gattserverdisconnected', bleOnDisconnected);
            const gatt = await bleDevice.gatt.connect();
            // Get DIS characteristics
            const dis = await gatt.getPrimaryService('device_information');
            const versionChar = await dis.getCharacteristic('firmware_revision_string');
            const versionValue = await versionChar.readValue();
            let decoder = new TextDecoder('utf-8');
            const versionValueString = decoder.decode(versionValue);
            // Get BAS characteristics
            const batService = await gatt.getPrimaryService('battery_service');
            const batChar = await batService.getCharacteristic('battery_level');
            // Get NUS characteristics
            const nusService = await gatt.getPrimaryService(UUIDS.NRF_UART_SERVICE_UUID);
            const rxChar = await nusService.getCharacteristic(UUIDS.NRF_UART_RX_CHAR_UUID);
            const txChar = await nusService.getCharacteristic(UUIDS.NRF_UART_TX_CHAR_UUID);
            bleSetupRxListener(rxChar);
            bleSetupBatListener(batChar);
            window.rxChar = rxChar;
            window.rxChar.startNotifications();
            window.txChar = txChar;
            window.batChar = batChar;
            window.batChar.startNotifications();
            console.log("Connected");
            bleConnected = true;
            clearInterval(searchTimer);
            connectBLEButtonLabel.innerHTML = 'Disconnect BLE';
            connectBLEStatusIcon.innerHTML = 'bluetooth_connected';
            connectBLEButton.removeAttribute('disabled');
            connectBLEStatusIcon.removeAttribute('disabled');
            deviceLabel.innerHTML = 'Device: ' + bleDevice.name + " v" + versionValueString;
            getDeviceInformation();
            enableControlButtons();
        }
        catch (err) {
            console.error("BLE Connection error " + err);
            alert("Unable to connect");
            clearInterval(searchTimer);
            connectBLEButtonLabel.innerHTML = 'Connect BLE';
            connectBLEStatusIcon.innerHTML = 'bluetooth';
            connectBLEButton.removeAttribute('disabled');
        }
    }
    else {
        bleDevice.gatt.disconnect();
    }
}

function bleOnDisconnected(event) {
    console.log("Disconnected");
    bleConnected = false;
    disableAllButtons();
    connectBLEButtonLabel.innerHTML = 'Connect BLE';
    connectBLEStatusIcon.innerHTML = 'bluetooth';
    connectBLEButton.removeAttribute('disabled');
    connectBLEStatusIcon.setAttribute('disabled', '');
    deviceLabel.innerHTML = 'Device';
}

function bleSetupRxListener(rxchar) {
    let rx_buf = [];
    /** This is the main RX callback for NUS. It handles sliced messages before calling appropriate callback */
    rxchar.addEventListener("characteristicvaluechanged",
        /** @param {Bluetooth} e */
        (e) => {
            /** @type {BluetoothRemoteGATTCharacteristic} */
            const char = e.target;
            let rx_data = new Uint8Array(char.value.buffer);
            rx_buf = new Uint8Array([...rx_buf,...rx_data]);
            let zeroIndex = rx_buf.indexOf(0);
            if(zeroIndex != -1) {
                const cobs_data = rx_buf.slice(0, zeroIndex + 1);
                decodeMessage(cobs_data);
                rx_buf = rx_buf.slice(zeroIndex + 1);
            }
        }
    );
}

function bleSetupBatListener(batchar) {
    batchar.addEventListener("characteristicvaluechanged",
        /** @param {Bluetooth} e */
        (e) => {
            /** @type {BluetoothRemoteGATTCharacteristic} */
            const char = e.target;
            const rx_data = new Uint8Array(char.value.buffer);
            const batteryLevel = rx_data[0];
            console.log("Battery " + batteryLevel +"%");
            updateViewBattery(batteryLevel);
        }
    );
}
/*******************************************************************************
 * RX Message decoder
 ******************************************************************************/

/**
 * @param {Uint8Array} message
 */
function decodeMessage(message) {
    try {
        const decoded = decode(message).subarray(0,-1);
        const protocol = proto.Protocol.deserializeBinary(decoded);
        if (protocol.hasResponse()) {
            const response = protocol.getResponse();
            if (response.hasAck()) {

            }
            if (response.hasMeasureparameterslist()) {
                const param_list = response.getMeasureparameterslist();
                commandTypeSelect.value = proto.EnslavementType.HEAT == param_list.getEnslavementtype() ? 'heat' : 'temp';
                tedAmField.value = param_list.getTedparameters().getAm();
                tedRmField.value = param_list.getTedparameters().getRm();
                tedTmField.value = param_list.getTedparameters().getTm();
                pidKpField.value = param_list.getPidparameters().getKp();
                pidKiField.value = param_list.getPidparameters().getKi();
                pidKdField.value = param_list.getPidparameters().getKd();
                pidDtField.value = param_list.getPidparameters().getDt();
            }
        }
        if (protocol.hasStream()) {
            const stream = protocol.getStream();
            if (stream.hasMeasurementsresults()) {
                setTempValues(stream.getMeasurementsresults());
                chartsAddMeasurement(stream.getMeasurementsresults());
            }
        }
    } catch (error) {
        console.error("Error while decoding message: " + error);
    }
}

/*******************************************************************************
 * TX Message encoder
 ******************************************************************************/

/**
 * @param {proto.Protocol} protocol
 */
async function encodeMessage(protocol) {
    /* Serialize JS object */
    let protoBuffer = protocol.serializeBinary();
    /* Encode with COBS */
    let cobsBuffer = encode(protoBuffer);
    /* Add final zero for subsequent decoding by nanocobs */
    cobsBuffer = new Uint8Array([...cobsBuffer, 0]);
    /* Dispatch to interface */
    if (bleConnected == true) {
        await txChar.writeValueWithoutResponse(cobsBuffer);
    }
    else {
        alert("No device connected to send request");
    }
}

/*******************************************************************************
 * Configuration Fields
 ******************************************************************************/

/* Graphical components binding */
const commandTypeSelect             = new mdc.select.MDCSelect(document.querySelector('.app-command-type-select'));
const tedAmField                    = new mdc.textField.MDCTextField(document.querySelector('.app-ted-am-field'));
const tedRmField                    = new mdc.textField.MDCTextField(document.querySelector('.app-ted-rm-field'));
const tedTmField                    = new mdc.textField.MDCTextField(document.querySelector('.app-ted-tm-field'));
const pidKpField                    = new mdc.textField.MDCTextField(document.querySelector('.app-pid-kp-field'));
const pidKiField                    = new mdc.textField.MDCTextField(document.querySelector('.app-pid-ki-field'));
const pidKdField                    = new mdc.textField.MDCTextField(document.querySelector('.app-pid-kd-field'));
const pidDtField                    = new mdc.textField.MDCTextField(document.querySelector('.app-pid-dt-field'));
const tedPreselectionSelect         = new mdc.select.MDCSelect(document.querySelector('.app-ted-preselection-select'));

/*******************************************************************************
 * Crossed interface controls
 ******************************************************************************/

/* Graphical components binding */
const configurationCardElement = document.getElementById('configuration-card-element');

const onConfigButton = document.querySelector('.app-on-config-button');
const onConfigButtonRipple = new mdc.ripple.MDCRipple(onConfigButton);
const offConfigButton = document.querySelector('.app-off-config-button');
const offConfigButtonRipple = new mdc.ripple.MDCRipple(offConfigButton);
const setConfigButton = document.querySelector('.app-set-config-button');
const setConfigButtonRipple = new mdc.ripple.MDCRipple(setConfigButton);
const batteryStatusIcon = document.querySelector('.app-bat-status-icon');
const deviceLabel = document.getElementById('device-title-id');

const tInElement = document.getElementById('tin-element');
const tOutElement = document.getElementById('tout-element');
const tRefElement = document.getElementById('tref-element');
const tAmbElement = document.getElementById('tamb-element');

tedPreselectionSelect.listen('MDCSelect:change', () => {
    tedPreselection(tedPreselectionSelect.value);
  });

function tedPreselection(value) {
    if (value == 'ted-1') {
        tedAmField.value = 0.029;
        tedRmField.value = 3.000;
        tedTmField.value = 10.17;
    }
    if (value == 'ted-2') {
        tedAmField.value = 0.00;
        tedRmField.value = 0.00;
        tedTmField.value = 0.00;
    }
    if (value == 'ted-3') {
        tedAmField.value = 0.00;
        tedRmField.value = 0.00;
        tedTmField.value = 0.00;
    }
}

commandTypeSelect.listen('MDCSelect:change', () => {
    defaultParameters(commandTypeSelect.value);
  });

function defaultParameters(value) {
    if (value == 'heat') {
        pidKpField.value = 0.3;
        pidKiField.value = 2.5;
        pidKdField.value = 0.0;
        pidDtField.value = 0.1;
    }
    if (value == 'temp') {
        pidKpField.value = 300;
        pidKiField.value = 50;
        pidKdField.value = 20;
        pidDtField.value = 0.1;
    }
}

function disableControlButtons() {
    batteryStatusIcon.setAttribute('disabled', '');
    updateConfiguration();
}

function enableControlButtons() {
    batteryStatusIcon.removeAttribute('disabled');
    updateConfiguration();
}

function disableAllButtons() {
    connectBLEButton.setAttribute('disabled', '');
    updateConfiguration();
}

/**
 * @param {number} level 
 */
function updateViewBattery(level) {
    if (level > 90) {
        batteryStatusIcon.innerHTML = 'battery_full';
    }
    else if (level > 80) {
        batteryStatusIcon.innerHTML = 'battery_6_bar';
    }
    else if (level > 70) {
        batteryStatusIcon.innerHTML = 'battery_5_bar';
    }
    else if (level > 60) {
        batteryStatusIcon.innerHTML = 'battery_4_bar';
    }
    else if (level > 50) {
        batteryStatusIcon.innerHTML = 'battery_3_bar';
    }
    else if (level > 40) {
        batteryStatusIcon.innerHTML = 'battery_2_bar';
    }
    else if (level > 30) {
        batteryStatusIcon.innerHTML = 'battery_1_bar';
    }
    else if (level > 20) {
        batteryStatusIcon.innerHTML = 'battery_0_bar';
    }
    else {
        batteryStatusIcon.innerHTML = 'battery_alert';
    }
}

async function onOnConfigButtonClick() {
    protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setSetmeasureparameterslist(new proto.SetMeasureParametersList()
        .setMeasureparameterslist(new proto.MeasureParametersList()
        .setEnslavementtype(commandTypeSelect.value == 'heat' ? proto.EnslavementType.HEAT : proto.EnslavementType.TEMP)
        .setTedparameters(new proto.TEDParameters()
        .setAm(tedAmField.value)
        .setRm(tedRmField.value)
        .setTm(tedTmField.value))
        .setPidparameters(new proto.PIDParameters()
        .setKp(pidKpField.value)
        .setKi(pidKiField.value)
        .setKd(pidKdField.value)
        .setDt(pidDtField.value)))));
    console.log(protocol.toObject())
    await encodeMessage(protocol);
    reinitTempValues();
    resetCharts();
    sleep(1000);
    protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setCommand(new proto.Command()
        .setCommandintensity(Number(document.querySelector('input[name="radios"]:checked').value))
        .setEnabled(true)));
    console.log(protocol.toObject());
    await encodeMessage(protocol);
    disableConfiguration();
}

async function onOffConfigButtonClick() {
    const protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setCommand(new proto.Command()
        .setCommandintensity(Number(document.querySelector('input[name="radios"]:checked').value))
        .setEnabled(false)));
    console.log(protocol.toObject());
    await encodeMessage(protocol);
    enableConfiguration();
}

async function onSetConfigButtonClick() {
    const protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setSetmeasureparameterslist(new proto.SetMeasureParametersList()
        .setMeasureparameterslist(new proto.MeasureParametersList()
        .setEnslavementtype(commandTypeSelect.value == 'heat' ? proto.EnslavementType.HEAT : proto.EnslavementType.TEMP)
        .setTedparameters(new proto.TEDParameters()
        .setAm(tedAmField.value)
        .setRm(tedRmField.value)
        .setTm(tedTmField.value))
        .setPidparameters(new proto.PIDParameters()
        .setKp(pidKpField.value)
        .setKi(pidKiField.value)
        .setKd(pidKdField.value)
        .setDt(pidDtField.value)))));
    console.log(protocol.toObject())
    await encodeMessage(protocol);
    reinitTempValues();
    resetCharts();
}

async function getDeviceConfiguration() {
    const protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setGetconfiguration(new proto.GetConfiguration()));
    await encodeMessage(protocol);
}

async function getDeviceBattery() {
    await batChar.readValue().then(value => {
        let batteryLevel = value.getUint8(0);
        console.log("Battery " + batteryLevel +"%");
        updateViewBattery(batteryLevel);
    })
}

function getDeviceInformation() {
    setTimeout(getDeviceBattery, 100);
}

function updateConfiguration() {
    offConfigButton.setAttribute('disabled', '');
    if (bleConnected == false) {
        onConfigButton.setAttribute('disabled', '');
        setConfigButton.setAttribute('disabled', '');
    }
    else {
        onConfigButton.removeAttribute('disabled');
        setConfigButton.removeAttribute('disabled');
    }
}

function disableConfiguration() {
    onConfigButton.setAttribute('disabled', '');
    offConfigButton.removeAttribute('disabled');
    setConfigButton.setAttribute('disabled', '');
    enableAllLevelRadios();
}

function enableConfiguration() {
    updateConfiguration();
    disableAllLevelRadios();
}

function reinitInterface() {
    updateConfiguration();
    reinitTempValues();
    disableAllLevelRadios();
}

/*******************************************************************************
 * Command Panel
 ******************************************************************************/

/* Graphical components binding */
const commandValueField = new mdc.textField.MDCTextField(document.querySelector('.app-command-value-field'));
const commandValueInput = document.getElementById('app-command-value-input');
const commandValueButton = document.querySelector('.app-command-value-button');
const commandValueButtonRipple = new mdc.ripple.MDCRipple(commandValueButton);
const levelRadios = document.querySelectorAll('.mdc-radio__native-control');
const defaultLevelRadio = document.getElementById('level-radio-defaut-element');

async function onCommandValueButtonClick() {
    const protocol = new proto.Protocol()
        .setRequest(new proto.Request()
        .setCommand(new proto.Command()
        .setCommandvalue(commandValueField.value)
        .setEnabled(true)));
    console.log(protocol.toObject());
    await encodeMessage(protocol);
}

for(levelRadio in levelRadios) {
    levelRadios[levelRadio].onclick = async function() {
        const protocol = new proto.Protocol()
            .setRequest(new proto.Request()
            .setCommand(new proto.Command()
            .setCommandintensity(Number(this.value))
            .setEnabled(true)));
        console.log(protocol.toObject());
        await encodeMessage(protocol);
    }
}

function disableAllLevelRadios() {   
    commandValueField.disabled = true;
    commandValueButton.disabled = true;
    for(levelRadio in levelRadios) {
        levelRadios[levelRadio].disabled = true;
    }
    defaultLevelRadio.checked = true;
}

function enableAllLevelRadios() {
    commandValueField.disabled = false;
    commandValueButton.disabled = false;
    for(levelRadio in levelRadios) {
        levelRadios[levelRadio].disabled = false;
    }
}

/*******************************************************************************
 * Temperature Values
 ******************************************************************************/

function reinitTempValues() {
    tInElement.innerHTML = '--.- °C';
    tOutElement.innerHTML = '--.- °C';
}


/**
 * @param {proto.MeasurementsResults} tempValues
 */
function setTempValues(tempValues) {
    tInElement.innerHTML  = (tempValues.getTempin()*0.01).toFixed(2) + ' °C';
    tOutElement.innerHTML = (tempValues.getTempout()*0.01).toFixed(2) + ' °C';
}

/*******************************************************************************
 * Data Plots
 ******************************************************************************/

/*** Global variables ***/
Chart.defaults.font.family = "'Roboto', 'Verdana'";
Chart.defaults.font.size = 12;
const chartTimeMax = 10.0; // seconds
timeDataStart = Date.now();
window.data = [];

/* Graphical components binding */

const heatChart = new Chart(document.getElementById('app-heat-chart-canvas'), {
    type: 'scatter',
    data: {
        labels: [],
        datasets: [
            {
                label: "Heat Measured",
                labels: [], 
                data: [], 
                tension: 0, 
                showLine: true,
            },
            {
                label: "Heat Command",
                labels: [], 
                data: [], 
                tension: 0, 
                showLine: true,
            }
        ],
    },
    options: {
        pointRadius: 0,
        animation: {
            duration: 0,
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { // defining min and max so hiding the dataset does not change scale range
                suggestedMin: 0,
                suggestedMax: chartTimeMax,
            },
            y: { // defining min and max so hiding the dataset does not change scale range
                suggestedMin: -4,
                suggestedMax: +4,
            },
        },
        plugins: {
            legend: {
                display: true
            },
        }
    }
});

const tempChart = new Chart(document.getElementById('app-temp-chart-canvas'), {
    type: 'scatter',
    data: {
        labels: [],
        datasets: [
            {
                label: "Temperature In",
                labels: [], 
                data: [], 
                tension: 0, 
                showLine: true,
                borderColor: '#1F3368',
                backgroundColor: '#1F3368',
            },
            {
                label: "Setpoint Temperature",
                labels: [], 
                data: [], 
                tension: 0, 
                showLine: true,
                borderColor: '#E64217',
                backgroundColor: '#E64217',
            }
        ],
    },
    options: {
        pointRadius: 0,
        animation: {
            duration: 0,
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { // defining min and max so hiding the dataset does not change scale range
                suggestedMin: 0,
                suggestedMax: chartTimeMax,
            },
            y: { // defining min and max so hiding the dataset does not change scale range
                suggestedMin: 20,
                suggestedMax: 40,
            },
        },
        plugins: {
            legend: {
                display: true
            },
        }
    }
});
function refreshCharts() {
    heatChart.update();
    tempChart.update();
}

setInterval(refreshCharts, 500)

/**
 * @param {proto.MeasurementsResults} results
 */
function chartsAddMeasurement(results) {
    time = (Date.now() - timeDataStart) * 0.001;
    
    // Heat Chart
    let heatMeasuredSample = {x: time, y: results.getHeat() * 0.1}
    heatChart.data.datasets[0].data.push(heatMeasuredSample);
    while (heatChart.data.datasets[0].data[heatChart.data.datasets[0].data.length - 1].x - heatChart.data.datasets[0].data[0].x > chartTimeMax) {
        heatChart.data.datasets[0].data.shift();
    }
    let heatCommandSample = {x: time, y: results.getSetvalueheat() * 0.1}
    heatChart.data.datasets[1].data.push(heatCommandSample);
    while (heatChart.data.datasets[1].data[heatChart.data.datasets[1].data.length - 1].x - heatChart.data.datasets[1].data[1].x > chartTimeMax) {
        heatChart.data.datasets[1].data.shift();
    }
    heatChart.options.scales['x'].min = Math.ceil(2 * heatChart.data.datasets[0].data[0].x)/2;
    heatChart.options.scales['x'].max = Math.max(chartTimeMax, Math.floor(2 * heatChart.data.datasets[0].data[heatChart.data.datasets[0].data.length - 1].x)/2);

    // Temperature Chart - Two lines: Temperature In and Command Value
    let tempInSample = {x: time, y: results.getTempin() * 0.01}
    tempChart.data.datasets[0].data.push(tempInSample);
    while (tempChart.data.datasets[0].data[tempChart.data.datasets[0].data.length - 1].x - tempChart.data.datasets[0].data[0].x > chartTimeMax) {
        tempChart.data.datasets[0].data.shift();
    }
    
    // Changed from temperature reference to command value
    let tempCommandSample = {x: time, y: results.getSetvaluetemp() * 0.01}
    tempChart.data.datasets[1].data.push(tempCommandSample);
    while (tempChart.data.datasets[1].data[tempChart.data.datasets[1].data.length - 1].x - tempChart.data.datasets[1].data[0].x > chartTimeMax) {
        tempChart.data.datasets[1].data.shift();
    }
    
    tempChart.options.scales['x'].min = Math.ceil(2 * tempChart.data.datasets[0].data[0].x)/2;
    tempChart.options.scales['x'].max = Math.max(chartTimeMax, Math.floor(2 * tempChart.data.datasets[0].data[tempChart.data.datasets[0].data.length - 1].x)/2);
}

// Ajout d'une fonction pour basculer l'affichage des graphiques en fonction du mode
function toggleChartDisplay(mode) {
    const heatChartContainer = document.getElementById('heat-chart-container');
    const tempChartContainer = document.getElementById('temp-chart-container');
    
    if (mode === 'heat') {
        heatChartContainer.style.display = 'block';
        tempChartContainer.style.display = 'none';
    } else if (mode === 'temp') {
        heatChartContainer.style.display = 'none';
        tempChartContainer.style.display = 'block';
    }
}

function resetTime() {
    timeDataStart = Date.now();
}

function resetCharts() {
    heatChart.data.labels = [];
    heatChart.data.datasets[0].data = [];
    heatChart.data.datasets[1].data = [];
    heatChart.update();
    tempChart.data.labels = [];
    tempChart.data.datasets[0].data = [];
    tempChart.data.datasets[1].data = [];
    tempChart.update();
    resetTime();
}

commandTypeSelect.listen('MDCSelect:change', () => {
    defaultParameters(commandTypeSelect.value);
    toggleChartDisplay(commandTypeSelect.value);
});

toggleChartDisplay('heat');

tedPreselection(tedPreselectionSelect.value);
defaultParameters(commandTypeSelect.value);
reinitInterface();
console.log("RUN JAVASCRIPT,  RUUUUUUUUNNNNN !!!!!");