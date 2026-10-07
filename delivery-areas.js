((root) => {
  "use strict";
  function payload(rows, price, currency) {
    if (!rows.length || rows.length > 20) throw new Error("Add between 1 and 20 delivery areas.");
    return rows.map((row, index) => {
      const country = row.country.trim().toUpperCase();
      const state = row.state.trim(), city = row.city.trim();
      const areaCurrency = row.currency.trim().toUpperCase();
      const itemPrice = row.custom ? Number(row.price) : Number(price);
      const fee = Number(row.fee);
      if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z]{3}$/.test(areaCurrency)) throw new Error(`Choose a country and currency for delivery area ${index + 1}.`);
      if (city && !state) throw new Error(`Enter the state for ${city}. Leave both fields empty if you deliver anywhere in the country.`);
      if ((!row.custom && areaCurrency !== currency) || (row.custom && !row.confirmed)) throw new Error(`Check the product price for delivery area ${index + 1}. Choose your main price, or confirm the different price shown.`);
      if (!Number.isFinite(itemPrice) || itemPrice <= 0 || row.custom && !String(row.price).trim()) throw new Error(`Enter a product price greater than zero for delivery area ${index + 1}.`);
      if (!String(row.fee).trim() || !Number.isFinite(fee) || fee < 0) throw new Error(`Enter a delivery charge for area ${index + 1}. Enter 0 for free delivery.`);
      return { country_code: country, state, city, item_price: itemPrice, delivery_fee: fee, currency_code: areaCurrency, uses_primary_price: !row.custom, independent_price_confirmed: row.custom && row.confirmed };
    });
  }
  function fromSaved(areas, price, currency) {
    return areas.map(area => {
      const item = Number(area.delivered_price) - Number(area.delivery_fee || 0);
      const custom = !area.uses_primary_price && (area.currency_code !== currency || item !== Number(price));
      return { country: area.country_code, state: area.state || "", city: area.city || "", fee: String(area.delivery_fee || 0), currency: area.currency_code, custom, price: String(item), confirmed: false };
    });
  }
  class Editor {
    constructor(container, { markets, mainPrice, mainCurrency, formatMoney }) {
      this.container = container; this.markets = markets; this.mainPrice = mainPrice; this.mainCurrency = mainCurrency; this.money = formatMoney; this.rows = [];
    }
    reset(country = "NG") {
      const market = this.markets().find(m => m.country_code === country) || this.markets()[0];
      this.rows = [{country: market?.country_code || "NG", state:"", city:"", fee:"0", currency:market?.currency_code || this.mainCurrency(), custom:false, price:"", confirmed:false}];
      this.render();
    }
    load(areas) { this.rows = fromSaved(areas, this.mainPrice(), this.mainCurrency()); if (!this.rows.length) this.reset(); else this.render(); }
    values() { return payload(this.rows, this.mainPrice(), this.mainCurrency()); }
    refresh() {
      this.rows.forEach(row => { if (!row.custom) { const currency = this.markets().find(m => m.country_code === row.country)?.currency_code || this.mainCurrency(); row.currency = currency; if (currency !== this.mainCurrency()) {row.custom=true;row.price="";row.confirmed=false;} } });
      this.render();
    }
    render() {
      this.container.replaceChildren();
      this.rows.forEach((row,index) => {
        const card = document.createElement("div"); card.className="delivery-area-card";
        const title=document.createElement("h4"); title.textContent=`Delivery area ${index+1}`; card.append(title);
        const fields=document.createElement("div"); fields.className="delivery-area-fields"; card.append(fields);
        const field=(label, control, help="")=>{ const wrap=document.createElement("label"); wrap.append(document.createTextNode(label),control); if(help){const small=document.createElement("small");small.textContent=help;wrap.append(small);} fields.append(wrap); return control; };
        const input=(key,label,help,type="text")=>{const control=document.createElement("input");control.type=type;control.value=row[key];if(type==="number"){control.min="0";control.step="0.01";}control.addEventListener("input",()=>{row[key]=control.value; if(key==="price") {row.confirmed=false; confirmation.checked=false;} summary();});field(label,control,help);return control;};
        const country=document.createElement("select");
        const markets=[...this.markets()]; if(!markets.some(m=>m.country_code===row.country))markets.push({country_code:row.country,currency_code:row.currency});
        markets.forEach(m=>{const option=document.createElement("option");option.value=m.country_code;option.textContent=m.country_name || (m.country_code==="NG" ? "Nigeria" : m.country_code);country.append(option);});
        country.value=row.country;country.addEventListener("change",()=>{row.country=country.value;row.currency=markets.find(m=>m.country_code===row.country)?.currency_code || this.mainCurrency();row.custom=row.currency!==this.mainCurrency();row.confirmed=false;this.render();});field("Country",country);
        input("state","State or FCT (optional)","Leave empty to deliver anywhere in the country.");
        input("city","Town or city (optional)","Leave empty to deliver anywhere in the state.");
        input("fee",`Delivery charge (${row.currency})`,"Enter 0 if delivery is free.","number");
        const advanced=document.createElement("details");advanced.open=row.custom;advanced.className="delivery-price-options";const caption=document.createElement("summary");caption.textContent="Want a different product price for this area?";advanced.append(caption);card.append(advanced);
        const checkLabel=document.createElement("label");checkLabel.className="check-option";const check=document.createElement("input");check.type="checkbox";check.checked=row.custom;check.disabled=row.currency!==this.mainCurrency();check.addEventListener("change",()=>{row.custom=check.checked;row.confirmed=false;if(!row.price)row.price=String(this.mainPrice() || "");this.render();});checkLabel.append(check,document.createTextNode(check.disabled ? `Enter the product price in ${row.currency} for buyers here.` : "Use a different product price here"));advanced.append(checkLabel);
        const confirmation=document.createElement("input");confirmation.type="checkbox";confirmation.checked=row.confirmed;
        if(row.custom){const customLabel=document.createElement("label");customLabel.textContent=`Product price (${row.currency})`;const custom=document.createElement("input");custom.type="number";custom.min="0.01";custom.step="0.01";custom.value=row.price;custom.addEventListener("input",()=>{row.price=custom.value;row.confirmed=false;confirmation.checked=false;summary();});customLabel.append(custom);advanced.append(customLabel);const confirmLabel=document.createElement("label");confirmLabel.className="check-option";confirmation.addEventListener("change",()=>row.confirmed=confirmation.checked);confirmLabel.append(confirmation,document.createTextNode("Yes, buyers here should pay this product price instead of my main price."));advanced.append(confirmLabel);}
        const note=document.createElement("p");note.className="delivery-price-summary";card.append(note);
        const summary=()=>{const amount=row.custom?Number(row.price):Number(this.mainPrice());const fee=Number(row.fee);const place=[row.city,row.state,country.selectedOptions[0]?.textContent || row.country].filter(Boolean).join(", ");note.textContent=Number.isFinite(amount)&&amount>0&&String(row.fee).trim()&&Number.isFinite(fee)&&fee>=0 ? `${place}: product ${this.money(amount,row.currency)} + delivery ${this.money(fee,row.currency)} = ${this.money(amount+fee,row.currency)}. Atlantic Express and payment charges are shown separately at checkout.` : "Enter the product price and delivery charge to see what buyers will pay.";};summary();
        if(this.rows.length>1){const remove=document.createElement("button");remove.type="button";remove.className="secondary";remove.textContent="Remove this area";remove.addEventListener("click",()=>{this.rows.splice(index,1);this.render();});card.append(remove);}
        this.container.append(card);
      });
    }
    add() { if(this.rows.length>=20)throw new Error("You can add up to 20 delivery areas.");const market=this.markets().find(m=>m.currency_code===this.mainCurrency()) || this.markets()[0];this.rows.push({country:market?.country_code || "NG",state:"",city:"",fee:"0",currency:market?.currency_code || this.mainCurrency(),custom:false,price:"",confirmed:false});this.refresh(); }
  }
  root.ProviderDeliveryAreas = { Editor, payload, fromSaved };
})(typeof window === "undefined" ? globalThis : window);
