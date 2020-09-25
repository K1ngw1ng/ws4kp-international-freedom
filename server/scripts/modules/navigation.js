'use strict';
// navigation handles progress, next/previous and initial load messages from the parent frame
/* globals index, utils, _StationInfo, STATUS */
/* globals CurrentWeather, LatestObservations, TravelForecast, RegionalForecast, LocalForecast, ExtendedForecast, Almanac, Radar, Progress, currentWeatherScroll */

document.addEventListener('DOMContentLoaded', () => {
	navigation.init();
});

const UNITS = {
	english: Symbol('english'),
	metric: Symbol('metric'),
};

const navigation = (() => {
	let weatherParameters = {};
	let displays = [];
	let currentUnits = UNITS.english;
	let playing = false;
	let progress;

	// current conditions are made available from the display below
	let currentWeather;

	const init = async () => {
		// nothing to do
	};

	const message = (data) => {
		// dispatch event
		if (!data.type) return;
		switch (data.type) {
		case 'latLon':
			getWeather(data.message);
			break;

		case 'units':
			setUnits(data.message);
			break;

		case 'navButton':
			handleNavButton(data.message);
			break;

		default:
			console.error(`Unknown event ${data.type}`);
		}

	};

	const postMessage = (type, message = {}) => {
		index.message({type, message});
	};

	const getWeather = async (latLon) => {
		// get initial weather data
		const point = await utils.weather.getPoint(latLon.lat, latLon.lon);

		// get stations
		const stations = await $.ajax({
			type: 'GET',
			url: point.properties.observationStations,
			dataType: 'json',
			crossDomain: true,
		});

		const StationId = stations.features[0].properties.stationIdentifier;

		let city = point.properties.relativeLocation.properties.city;

		if (StationId in _StationInfo) {
			city = _StationInfo[StationId].city;
			city = city.split('/')[0];
		}


		// populate the weather parameters
		weatherParameters.latitude = latLon.lat;
		weatherParameters.longitude = latLon.lon;
		weatherParameters.zoneId = point.properties.forecastZone.substr(-6);
		weatherParameters.radarId = point.properties.radarStation.substr(-3);
		weatherParameters.stationId = StationId;
		weatherParameters.weatherOffice = point.properties.cwa;
		weatherParameters.city = city;
		weatherParameters.state = point.properties.relativeLocation.properties.state;
		weatherParameters.timeZone = point.properties.relativeLocation.properties.timeZone;
		weatherParameters.forecast = point.properties.forecast;
		weatherParameters.stations = stations.features;

		// update the main process for display purposes
		postMessage('weatherParameters', weatherParameters);

		// draw the progress canvas
		progress = new Progress(-1,'progress');
		await progress.drawCanvas();
		progress.showCanvas();

		// start loading canvases if necessary
		if (displays.length === 0) {
			currentWeather = new CurrentWeather(0,'currentWeather');
			displays = [
				currentWeather,
				new LatestObservations(1, 'latestObservations'),
				new TravelForecast(2, 'travelForecast', false),	// not active by default
				new RegionalForecast(3, 'regionalForecast'),
				new LocalForecast(4, 'localForecast'),
				new ExtendedForecast(5, 'extendedForecast'),
				new Almanac(6, 'almanac'),
				new Radar(7, 'radar'),
			];
		}
		// call for new data on each display
		displays.forEach(display => display.getData(weatherParameters));
		// pass the information to the bottom scroll
		currentWeatherScroll.setStation(weatherParameters);

		// GetMonthPrecipitation(this.weatherParameters);
		// GetAirQuality3(this.weatherParameters);
		// ShowDopplerMap(this.weatherParameters);
		// GetWeatherHazards3(this.weatherParameters);

	};

	// receive a status update from a module {id, value}
	const updateStatus = (value) => {
		if (value.id < 0) return;
		progress.drawCanvas(displays, countLoadedCanvases());

		// if this is the first display and we're playing, load it up so it starts playing
		if (isPlaying() && value.id === 0 && value.status === STATUS.loaded) {
			navTo(msg.command.firstFrame);
		}

		// send loaded messaged to parent
		if (countLoadedCanvases() < displays.length) return;
		postMessage('loaded');
	};

	const countLoadedCanvases = () => displays.reduce((acc, display) => {
		if (display.status !== STATUS.loading) return acc+1;
		return acc;
	},0);

	const hideAllCanvases = () => {
		displays.forEach(display => display.hideCanvas());
	};

	const units = () => currentUnits;
	const setUnits = (_unit) => {
		const unit = _unit.toLowerCase();
		if (unit === 'english') {
			currentUnits = UNITS.english;
		} else {
			currentUnits = UNITS.metric;
		}
		// TODO: refresh current screen
	};

	// is playing interface
	const isPlaying = () => playing;

	// navigation message constants
	const msg = {
		response: {	// display to navigation
			previous: Symbol('previous'),		// already at first frame, calling function should switch to previous canvas
			inProgress: Symbol('inProgress'),	// have data to display, calling function should do nothing
			next: Symbol('next'),				// end of frames reached, calling function should switch to next canvas
		},
		command: {	// navigation to display
			firstFrame: Symbol('firstFrame'),
			previousFrame: Symbol('previousFrame'),
			nextFrame: Symbol('nextFrame'),
			lastFrame: Symbol('lastFrame'),	// used when navigating backwards from the begining of the next canvas
		},
	};

	// receive navigation messages from displays
	const displayNavMessage = (message) => {
		if (message.type === msg.response.previous) loadDisplay(-1);
		if (message.type === msg.response.next) loadDisplay(1);
	};

	// navigate to next or previous
	const navTo = (direction) => {
		// test for a current display
		const current = currentDisplay();
		progress.hideCanvas();
		if (!current) {
			// special case for no active displays (typically on progress screen)
			displays[0].navNext(msg.command.firstFrame);
			return;
		}
		if (direction === msg.command.nextFrame) currentDisplay().navNext();
		if (direction === msg.command.previousFrame) currentDisplay().navPrev();
	};

	// find the next or previous available display
	const loadDisplay = (direction) => {
		const totalDisplays = displays.length;
		const curIdx = currentDisplayIndex();
		let idx;
		for (let i = 0; i < totalDisplays; i++) {
			// convert form simple 0-10 to start at current display index +/-1 and wrap
			idx = utils.calc.wrap(curIdx+(i+1)*direction,totalDisplays);
			if (displays[idx].status === STATUS.loaded) break;
		}
		const newDisplay = displays[idx];
		// hide all displays
		hideAllCanvases();
		// show the new display and navigate to an appropriate display
		if (direction < 0) newDisplay.showCanvas(msg.command.lastFrame);
		if (direction > 0) newDisplay.showCanvas(msg.command.firstFrame);
	};

	// get the current display index or value
	const currentDisplayIndex = () => {
		let index = displays.findIndex(display=>display.isActive());
		return index;
	};
	const currentDisplay = () => {
		return displays[currentDisplayIndex()];
	};

	const setPlaying = (newValue) => {
		playing = newValue;
		postMessage('isPlaying', playing);
		// if we're playing and on the progress screen jump to the next screen
		if (!progress) return;
		if (playing && !currentDisplay()) navTo(msg.command.firstFrame);
	};

	// handle all navigation buttons
	const handleNavButton = (button) => {
		switch (button) {
		case 'play':
			setPlaying(true);
			break;
		case 'playToggle':
			setPlaying(!playing);
			break;
		case 'stop':
			setPlaying(false);
			break;
		case 'next':
			setPlaying(false);
			navTo(msg.command.nextFrame);
			break;
		case 'previous':
			setPlaying(false);
			navTo(msg.command.previousFrame);
			break;
		case 'menu':
			setPlaying(false);
			progress.showCanvas();
			hideAllCanvases();
			break;
		default:
			console.error(`Unknown navButton ${button}`);
		}
	};

	// return the specificed display
	const getDisplay = (index) => displays[index];

	// get current conditions
	const getCurrentWeather = () => {
		if (!currentWeather) return false;
		return currentWeather.getCurrentWeather();
	};

	return {
		init,
		message,
		updateStatus,
		units,
		isPlaying,
		displayNavMessage,
		msg,
		getDisplay,
		getCurrentWeather,
	};
})();