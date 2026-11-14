# Installing the plugin for video downloads

Convert Them All converts images, audio, documents, spreadsheets, archives and
web pages on its own. **Downloading a video is the one thing it cannot do by
itself**: a Firefox add-on is not allowed to run a program, and downloading a
video means running one.

So there is a small plugin that sits outside the browser. You install it once.

Two ways to do it, on every system. Both end at the same place.

## Which way?

### A: the simple way

One download, one command, nothing else to install.

**You cannot check what you are running.** It is a compiled program, so
opening it tells you nothing: the readable code went in, machine code came
out, and you have only our word that one matches the other. 

**If you do not trust us, which is fair, take route B instead.**

### B: the Python way (recommended)

A few more steps, because you install Python first. That is not hard, and in
exchange you can see exactly what you are running.

Python is not compiled. The file you install is the same text you can open in
any editor, and the computer runs that text directly. So anyone can check it:
a friend who writes software, a search engine, or a chatbot, which will read
the file and tell you in plain words what each part does. Nothing is hidden,
because there is nowhere to hide it.

Find your system: **[Linux](#linux)** · **[Windows](#windows)** ·
**[macOS](#macos)**

---

## Linux

### A: the simple way

 **[Read first](#a-the-simple-way)**
 
**1. Download the plugin.**

<https://github.com/cadieuxpaquinr/convert-them-all/releases/latest/download/cta-helper-linux.zip>

**2. Unzip it.** In your file manager, right-click the file and choose
"Extract Here". You now have a folder called `cta-helper-linux`.

**3. Open a terminal in that folder.** In most file managers, right-click
inside the folder and choose "Open in Terminal". If yours has no such entry,
open a terminal and type `cd `, then drag the folder onto the window, then
press Enter.

**4. Run the installer.**

```sh
sh ./install.sh
```

**5. Go back to Convert Them All and press "installation complete, reload".**

### B: the Python way

**[Read first](#b-the-python-way-recommended)**

**1. Check that Python is installed.**

```sh
python3 --version
```

If that prints an error, install it with your package manager, for example
`sudo apt install python3`.

**2. Download the code.**

<https://github.com/cadieuxpaquinr/convert-them-all/archive/refs/heads/0.2.0/main.zip>

**3. Unzip it,** the same way as above.

**4. Open a terminal in the `host` folder inside it.**

**5. Run the installer.**

```sh
sh ./install.sh
```

**6. Go back to Convert Them All and press "installation complete, reload".**

### If it does not work

**A Firefox installed as a snap cannot reach the plugin.** Snap confines
Firefox, and a program started from inside that confinement cannot see yt-dlp
or ffmpeg. Use the Firefox from your distribution, or the one from
mozilla.org, instead. To find out which you have:

```sh
which firefox
```

A path under `/snap/` means you have the snap.

---

## Windows

### A: the simple way

 **[Read first](#a-the-simple-way)**

**1. Download the plugin.**

<https://github.com/cadieuxpaquinr/convert-them-all/releases/latest/download/cta-helper-windows.zip>

**2. Unzip it.** Right-click the downloaded file and choose "Extract All",
then "Extract". You now have a folder called `cta-helper-windows`.

**3. Open that folder.**

**4. Double-click `cta-install.exe`.** A black window appears, says what it
did, and waits for you to press a key. No terminal, no typing.

**5. Go back to Convert Them All and press "installation complete, reload".**

### B: the Python way

**[Read first](#b-the-python-way-recommended)**

**1. Install Python.**

<https://www.python.org/downloads/>

On the first screen of the installer, **tick "Add python.exe to PATH"** before
pressing Install. Without that tick nothing below will find it.

**2. Download the code.**

<https://github.com/cadieuxpaquinr/convert-them-all/archive/refs/heads/0.2.0/main.zip>

**3. Unzip it,** the same way as above.

**4. Open the `host` folder inside it.**

**5. Open PowerShell there.** Hold Shift, right-click on an empty part of the
folder, and choose "Open PowerShell window here". On Windows 11 choose "Open
in Terminal".

**6. Run the installer.**

```powershell
python install.py
```

**7. Go back to Convert Them All and press "installation complete, reload".**

### If Windows warns you

**"Windows protected your PC", or a warning about an unknown publisher.**
Neither program is signed, because a signing certificate costs money every
year. Press "More info", then "Run anyway". It can appear twice: once for the
installer, and once later when Firefox first starts the plugin. If you would
rather not, use route B: `install.py` and `cta_host.py` are both text, and you
can read every line of them first.

**The window closed before you could read it.** It waits for a key, so that
should not happen. If it does, the installer did not start at all, which
usually means the folder was not unzipped: running it from inside the zip
preview will not work.

---

## macOS

### A: the simple way

 **[Read first](#a-the-simple-way)**

**1. Download the plugin.**

<https://github.com/cadieuxpaquinr/convert-them-all/releases/latest/download/cta-helper-macos.zip>

**2. Unzip it.** Double-click the downloaded file. You now have a folder
called `cta-helper-macos`.

**3. Let macOS run it.** The program is not signed by Apple, so it is blocked
until you say otherwise. Right-click `cta-helper` inside the folder, choose
"Open", then "Open" again in the dialog. It will print nothing and close; that
is correct, and it only has to be done once.

**4. Open a terminal in that folder.** Right-click the folder, then
"Services", then "New Terminal at Folder". If that entry is missing, open
Terminal, type `cd `, drag the folder onto the window, and press Enter.

**5. Run the installer.**

```sh
sh ./install.sh
```

**6. Go back to Convert Them All and press "installation complete, reload".**

### B: the Python way

**[Read first](#b-the-python-way-recommended)**

**1. Check that Python is installed.**

```sh
python3 --version
```

If macOS offers to install the developer tools, accept; that is where Python
comes from. Otherwise get it from <https://www.python.org/downloads/>.

**2. Download the code.**

<https://github.com/cadieuxpaquinr/convert-them-all/archive/refs/heads/0.2.0/main.zip>

**3. Unzip it,** by double-clicking.

**4. Open a terminal in the `host` folder inside it,** as in step 4 above.

**5. Run the installer.**

```sh
sh ./install.sh
```

**6. Go back to Convert Them All and press "installation complete, reload".**

---

## What the installer does

It writes one small file telling Firefox where the plugin is, and nothing
else. No service, no startup entry, nothing outside your own user account:

- **Linux**: `~/.mozilla/native-messaging-hosts/convert_them_all.json`
- **macOS**:
  `~/Library/Application Support/Mozilla/NativeMessagingHosts/convert_them_all.json`
- **Windows**: the same file beside the plugin, named once in the registry
  under `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts`

**Leave the folder where it is.** The file points at it. If you move the
plugin later, run the installer again from its new home.

## Uninstalling

Delete that file, and delete the folder you unzipped.

```sh
rm ~/.mozilla/native-messaging-hosts/convert_them_all.json
```

On Windows, delete the registry key of the same name with `regedit`, or run:

```powershell
Remove-Item 'HKCU:\Software\Mozilla\NativeMessagingHosts\convert_them_all'
```

## After it is installed

The add-on's home page will tell you what is still missing. Video downloads
also need **yt-dlp**, and **ffmpeg** for sites that send the picture and the
sound separately, which above 360p includes YouTube. The home page links to
both.

**You can leave them in Downloads.** Both are looked for there, including
inside the folder an unzipped ffmpeg build makes, and inside the second folder
of the same name that Windows adds when you use "Extract All". There is
nothing to move and no PATH to edit. If you keep them somewhere else, say
where in Settings, under Programs.
