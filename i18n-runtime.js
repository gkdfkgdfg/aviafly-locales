/* Source for avia-i18n.js. Rebuild with node tools/build-i18n.js. */
(function (packs) {
  'use strict';
  const names = {ru:'Русский',en:'English',es:'Español',pl:'Polski',sr:'Srpski',cs:'Čeština',it:'Italiano'};
  const normalize = value => String(value || '').toLowerCase().split(/[-_]/)[0];
  let saved = ''; try { saved = localStorage.getItem('avia-language'); } catch (_) {}
  const requested = normalize(new URLSearchParams(location.search).get('lang') || saved || window.__OPTIONS__.locale);
  const lang = names[requested] ? requested : 'en', pack = packs[lang];
  window.__OPTIONS__.locale = lang; document.documentElement.lang = lang;
  const safe = text => String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const label = pack?.language || ({ru:'Язык',es:'Idioma'}[lang] || 'Language');
  function selectHTML(id) {
    return `<label class="avia-language-field">${safe(label)} <select id="${id}" aria-label="${safe(label)}">${Object.entries(names).map(([code,name])=>`<option value="${code}"${code===lang?' selected':''}>${name}</option>`).join('')}</select></label>`;
  }
  function bindLanguage(root) {
    root.querySelectorAll('.avia-language-field select').forEach(select => select.addEventListener('change', () => {
      if (!names[select.value]) return;
      try { localStorage.setItem('avia-language',select.value); } catch (_) {}
      const url = new URL(location.href); url.searchParams.set('lang',select.value); location.replace(url.href);
    }));
  }
  const walletSources = ['Отключить портал','раунды без портала (со следующего полёта)','Скрыть верхнюю панель','высота, дистанция, множитель','Скрыть нижнюю панель','баланс и ставка','Скрыть иксы и прочее','только знаки «×», «+» на бонусах и «×» у множителя','Скрыть числа в полёте','надписи на бонусах целиком','Скрыть валюту в портале','сумма монет в портале без валюты'];
  const walletMap = pack ? Object.fromEntries([
    ['Настройки игры',pack.walletTitle],['Закрыть',pack.close],['Валюта',pack.currency],['Баланс',pack.balance],['Применить',pack.apply],['Звук и правила',pack.soundRules],
    ...walletSources.map((source,i)=>[source,pack.toggles.flat()[i]])
  ]) : {};
  const statusMap = pack ? {'Нажмите «Применить»':pack.pressApply,'Укажите валюту':pack.enterCurrency,'Баланс: число от 0':pack.balanceError,'Сохранено':pack.saved} : {};
  function settingsMarkup(html) {
    for (const source of Object.keys(walletMap).sort((a,b)=>b.length-a.length)) html = html.split(source).join(safe(walletMap[source]));
    return html.replace('<div class="fp-wallet-row">',selectHTML('avia-settings-language')+'<div class="fp-wallet-row">');
  }
  function hud(IMG) {
    if (!pack) return null;
    return {...pack,settings:`<h2>${pack.settings}</h2><div class="ah-row"><img src="${IMG}btn_sound_on.webp" alt=""><label>${pack.sounds}</label><input aria-label="${pack.sounds}" class="ah-range" type="range" min="0" max="100" data-v="fx"></div><div class="ah-row"><img src="${IMG}btn_sound_on.webp" alt=""><label>${pack.music}</label><input aria-label="${pack.music}" class="ah-range" type="range" min="0" max="100" data-v="music"></div><div class="ah-sub">${pack.how}</div><div class="ah-rules">${pack.rules.join('<br>')}</div>`};
  }
  function decorateHUD(root) {
    const labels = pack || (lang==='ru'?{menu:'Настройки',sounds:'Звук',minus:'Уменьшить ставку',plus:'Увеличить ставку',play:'Играть',auto:'Автоигра',balance:'Баланс',altitude:'Высота',distance:'Дистанция'}:null) || {menu:'Settings',sounds:'Sound',minus:'Decrease bet',plus:'Increase bet',play:'Play',auto:'Autoplay',balance:'Balance',altitude:'Altitude',distance:'Distance'};
    for (const [key,value] of Object.entries({menu:pack?.walletTitle||labels.menu,sound:labels.sounds,minus:labels.minus,plus:labels.plus,spin:labels.play,auto:labels.auto,bal:labels.balance,alt:labels.altitude,dist:labels.distance})) {
      const node = root.querySelector(`[data-k="${key}"]`); if (node && value) {node.setAttribute('aria-label',value);node.title=value;}
    }
    const loaderSelect = document.getElementById('avia-language-loader'); if(loaderSelect)loaderSelect.remove();
  }
  function decorateWin(root) {
    if (!pack) return;
    for(const title of root.querySelectorAll('[data-t]')) {title.classList.add('avia-localized-title');title.textContent=pack.titles[title.dataset.t];}
  }
  // Supply the engine's ordinary dialogs and errors through its existing locale loader.
  const source = window.__AVIA_ASSETS__['shared/translations/LocalAviaGame/en.json'];
  // The source has Russian HUD text but only ships English/Spanish engine dictionaries.
  const engineText = pack || (lang === 'ru' ? {
    loading:'Загрузка',altitude:'Высота',distance:'Дистанция',balance:'Баланс',continue:'Продолжить',stop:'Остановить',confirm:'Подтвердить',cancel:'Отмена',apply:'Применить',win:'Выигрыш',settings:'Настройки',music:'Музыка',sounds:'Звуки',autoTitle:'Автоигра',bet:'Ставка',funds:'Недостаточно средств.',loadingError:'ОШИБКА ЗАГРУЗКИ',error:'Произошла ошибка. Обновите страницу.',titles:{big:'БОЛЬШОЙ ВЫИГРЫШ',mega:'МЕГА ВЫИГРЫШ',super:'СУПЕР ВЫИГРЫШ'}
  } : null);
  if (engineText && source) {
    const base = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(source[1]),ch=>ch.charCodeAt(0))));
    const put=(key,value)=>{const parts=key.split('.');let at=base;for(const part of parts.slice(0,-1))at=at[part]||(at[part]={});at[parts.at(-1)]=value;};
    const values={'loading':engineText.loading,'localaviagame.altitude':engineText.altitude,'localaviagame.distance':engineText.distance,'panel.balance':engineText.balance,'buttons.ok':'OK','buttons.resume':engineText.continue,'buttons.pause':engineText.stop,'confirm':engineText.confirm,'cancel':engineText.cancel,'save':engineText.apply,'win':engineText.win,'total_win':engineText.win,'settings.labels.settings':engineText.settings,'settings.labels.music':engineText.music,'settings.labels.sound_fx':engineText.sounds,'settings.labels.auto_play':engineText.autoTitle,'settings.bet.total_bet':engineText.bet,'slot.popups.buy_bonus.not_enough':engineText.funds,'slot.popups.buy_bonus.cancel':engineText.cancel,'slot.popups.big_win':engineText.titles.big,'slot.popups.mega_win':engineText.titles.mega,'slot.popups.super_win':engineText.titles.super,'slot.click_to_continue':engineText.continue,'slot.tap_to_continue':engineText.continue};
    for(const [key,value] of Object.entries(values))put(key,value);
    for(const section of ['errors','errors-no-code'])for(const key of Object.keys(base[section]||{}))base[section][key]=key.startsWith('301')?engineText.funds:key==='loading_error'?engineText.loadingError:engineText.error;
    const data = new TextEncoder().encode(JSON.stringify(base)); let binary='';for(const byte of data)binary+=String.fromCharCode(byte);
    window.__AVIA_ASSETS__[`shared/translations/LocalAviaGame/${lang}.json`]=['application/json',btoa(binary)];
  }
  window.AviaI18n = {lang,pack,names,hud,bindLanguage,settingsMarkup,decorateHUD,decorateWin,status:message=>statusMap[message]||message};
  const style = document.createElement('style');
  style.textContent = '.avia-language-field{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:16px;color:#fff;font:600 14px system-ui,sans-serif}.avia-language-field select{min-width:130px;max-width:100%;padding:8px 12px;background:#14213d;color:#fff;border:1px solid #ffffff44;border-radius:9px;font:inherit}#avia-language-loader{position:fixed;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));z-index:3001;padding:8px 10px;background:#0c1c4be6;border-radius:12px}.avia-localized-title{background-image:none!important;color:#ffe36c!important;font:900 clamp(22px,5vw,64px)/1.15 system-ui,sans-serif!important;text-align:center;text-shadow:0 3px 0 #7c3600,0 0 15px #ffb700;align-content:center;overflow-wrap:normal}';
  document.head.appendChild(style);
  document.addEventListener('DOMContentLoaded',()=>{const box=document.createElement('div');box.id='avia-language-loader';box.innerHTML=selectHTML('avia-loader-language');document.body.appendChild(box);bindLanguage(box);});
})(__AVIA_LOCALES__);
