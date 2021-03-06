import Ember from 'ember';

export default Ember.TextField.extend({
  /**
   * Component settings defaults
   */
  valueFormat: 'X',           // expect unix timestamp format from data binding
  format: 'YYYY-MM-DD',       // the format to display in the text field
  allowBlank: false,          // whether `null` input/result is acceptable
  utc: false,                 // whether the input value is meant as a UTC date
  dismissOnScroll: false,     // whether the picker should dismiss on any scroll event
  scrollContainer: null,      // where to attach the picker
  date: null,                 // local date value, can be observed to handle input change
  initDate: null,             // value being received from parent component
  hasNullFooter: false,
  nullFooterCheckboxId: `checkBox${Math.floor(Math.random() * 100000)}`,
  nullFooterCheckboxValue: false,
  nullFooter: (nullFooterCheckboxId, getIsChecked) => {
    let checked = getIsChecked() ? 'checked' : '';
    return `<hr/><label title="Empty Field entries"><input id="${nullFooterCheckboxId}" ${checked} type="checkbox">Empty Field entries</label>`;
  },
  yearRange: function() {
    var cy = window.moment().year();
    return `${cy-3},${cy+4}`;
  }.property(), // default yearRange from -3 to +4 years
  // A private method which returns the year range in absolute terms
  _yearRange: function() {
    var yr = this.get('yearRange');
    if (!Ember.$.isArray(yr)) {
      yr = yr.split(',');
    }
    // assume we're in absolute form if the start year > 1000
    if (parseInt(yr[0], 10) > 1000) {
      return yr;
    }
    // relative form must be updated to absolute form
    var cy = window.moment().year();
    return [cy + parseInt(yr[0], 10), cy + parseInt(yr[1], 10)];
  }.property('yearRange'),

  _picker: null,

  /**
   * Setup Pikaday element after component was inserted.
   */
  setup: function(){
    Ember.run.schedule('afterRender', this, function() {

      var scrollElement = this.$().closest(this.get('scrollContainer'))[0];
      var formElement = this.$()[0],
          that = this,
          pickerOptions = {
            field: formElement,
            yearRange: that.get('_yearRange'),
            clearInvalidInput: true,
            container: scrollElement,
            /**
             * After the Pikaday component was closed, read the selected value
             * from the input field (remember we're extending Ember.TextField!).
             *
             * If that value is empty or no valid date, depend on `allowBlank` if
             * the `date` binding will be set to `null` or to the current date.
             *
             * Format the "outgoing" date with respect to the given `format`.
             */
            onClose: function() {
              // use `moment` or `moment.utc` depending on `utc` flag
              var momentFunction = that.get('utc') ? window.moment.utc : window.moment,
                  d = momentFunction(that.get('date'), that.get('format'));
              // has there been a valid date or any value at all?
              if (!d.isValid() || !that.get('date')) {
                if (that.get('allowBlank')) {
                  // allowBlank means `null` is ok, so use that
                  return that.set('date', null);
                } else {
                  // "fallback" to current date
                  d = window.moment();
                }
              }

              that._setControllerDate(d);
            }
          },
          picker = null;

      ['bound', 'position', 'reposition', 'format', 'firstDay', 'minDate',
       'maxDate', 'showWeekNumber', 'isRTL', 'i18n', 'yearSuffix', 'disableWeekends', 'disableDayFn',
       'showMonthAfterYear', 'numberOfMonths', 'mainCalendar', 'footer'].forEach(function(f) {
         if (!Ember.isEmpty(that.get(f))) {
           pickerOptions[f] = that.get(f);
         }
       });

       if (this.get('hasNullFooter')) {
         let nullFooterCheckboxId = this.get('nullFooterCheckboxId');
         pickerOptions['footer'] = this.get('nullFooter');
         pickerOptions['nullFooterCheckboxId'] = this.get('nullFooterCheckboxId');
         pickerOptions['getIsChecked'] = () => {
           return this.get('nullFooterCheckboxValue');
         };
         pickerOptions['onFocus'] = () => {
           Ember.$(`#${nullFooterCheckboxId}`).change((e) => {
             this.set('nullFooterCheckboxValue', e.target.checked);
           });
         };
       }
      picker = new window.Pikaday(pickerOptions);

      if (this.get('dismissOnScroll')) {
        window.addEventListener('scroll', () => picker.hide(), true);
      }

      if (scrollElement) {
        window.addEventListener('scroll', () => picker.adjustPosition(), true);
      }

      // store Pikaday element for later access
      this.set("_picker", picker);

      // initially sync Pikaday with external `date` value
      this.setDate();

    });
  }.on('init'),
  /**
   * Set the date on the controller.
   */
  _setControllerDate: function(d) {
      // update date value with user selected date with consistent format
      if (this.get('valueFormat') === 'date') {
        d = d.toDate();
      } else if (this.get('valueFormat') === 'moment') {
        // just set date as a moment object
      } else {
        d = d.format(this.get('valueFormat'));
      }

      // allow a call back to handle controller updates 
      // or default to Ember.Textfield behavior
      if (this.get('onClose')) {
        this.get('onClose')(d);
      } else {
        this.set('date', d);
      }
  },
  willClearRendaer() {
    this.$().off();
  },
  /**
   * Propper teardown to remove Pickady from the dom when the component gets
   * destroyed.
   */
  willDestroyElement: function() {
    this.get('_picker').destroy();
    this._super();
  },
  /**
   * Change handler on input, to synchronize text entry and not rely on the
   * onClose() Pikaday callback for state updates
   */
  change(event) {
    this.set('date', event.target.value);
  },
  /**
   * Update Pikaday's displayed date after bound `date` changed and also after
   * the initial `didInsertElement`.
   *
   * Depending on the format in `valueFormat`, serialize date object from plain
   * JS Date or from specified string format.
   *
   * If no `date` is set in the data source, it depends on `allowBlank` whether
   * "new Date()" is used or an invalid date will force Pikaday to clear the
   * input element shown on the page.
   * 
   * MODIFIED: Listens to initial value (initDate) passed in by parent component, then 
   * sets that value to local state (date)
   */
  setDate: function() {
    var d = null;
    if (!Ember.isBlank(this.get('initDate'))) {
      // serialize moment.js date either from plain date object or string
      if (this.get('valueFormat') === 'initDate') {
        d = window.moment(this.get('initDate'));
      } else if (this.get('valueFormat') === 'moment') {
        d = this.get('initDate');
      } else {
        d = window.moment(this.get('initDate'), this.get('valueFormat'));
      }
    } else {
      // no date was found in data source. Either respect that or set it to now
      if (this.get('allowBlank')) {
        // creates an "Invalid Date" object, which will clear the input field
        d = window.moment(null);
        // pickaday does not update the input value correctly when the date is set back to null
        this.$().val('');
      } else {
        d = window.moment();
        // also set the controllers date here. If the controller passes in a
        // null date, it is assumed that todays date should be used
        this._setControllerDate(d);
      }
    }
    let date = d.format(this.get('valueFormat')) === 'Invalid date' ? '' :
      d.format(this.get('valueFormat'));

    this.set('date', date);
    this.get('_picker').setDate(d.format());
  }.observes('initDate'),
  /**
   * Update Pikaday's minDate after bound `minDate` changed and also after
   * the initial `didInsertElement`.
   */
  setMinDate: function() {
    if (!Ember.isBlank(this.get('minDate'))) {
      this.get('_picker').setMinDate(this.get('minDate'));
    }
  }.observes('minDate'),
  /**
   * Update Pikaday's maxDate after bound `maxDate` changed and also after
   * the initial `didInsertElement`.
   */
  setMaxDate: function() {
    if (!Ember.isBlank(this.get('maxDate'))) {
      this.get('_picker').setMaxDate(this.get('maxDate'));
    }
  }.observes('maxDate')
});
