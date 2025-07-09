# RENFORCE heat stimulation web application

## Build and package the application locally

### Prerequisites

- Node
- NPM

### Add files ```main.js```, ```pacakage.json``` and ```forge.config.js```

- edit entries (author, titles, etc.) to fit the application name and so on.

### Add a ```build``` folder with app icons

- ```icon.png``` for Linux (512 x 512)
- ```icon.ico``` for Windows
- ```icon.icns``` for MacOs
- In ```build/icon``` directory, a set of ```32x32.png```, ```64x64.png```, 
```128x128.png```, ```256x256.png```, ```512x512.png```

### Configure Electron

- ```npm install electron --save-dev```

### (Optional) Run app locally

- ```npm run start```

### Packaging the application

- ```npm install --save-dev @electron-forge/cli```
- ```npx electron-forge import```

To build binary for the host platform:

- ```npx electron-forge package```

To build for another platform:

- ```npx electron-forge package --arch=x64 --platform=[win32, linux]```

### Create distributables (install files)

For host platform:

- ```npm run make```

## Pacakge and distribute the application using CI on gitlab.com

The file ```.gitlab-ci.yml``` is an example of pipeline to package the
application for Windows and Linux, using the above steps.

Two differents jobs are used to separate assets, but one single job could be
used if both binaries has to be in the same archive.

The script provides an example where:

- Jobs are done only when a tag is pushed on the repo
- Assets are generated (and named accordingly) separately for Windows and Linux
- A release is created with links to the different assets.

Notes: Docker images used for CI are linux images so the Windows build require
Wine and Mono, hence the specific docker image used.
Also additional packages are required and installed in ```before_script:```
section.