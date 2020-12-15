/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React from 'react';
import PropTypes from 'prop-types';
import { t } from '@superset-ui/core';
import { isEqual } from 'lodash';

import Select from 'src/components/Select';
import ControlHeader from '../ControlHeader';
import MetricDefinitionOption from '../MetricDefinitionOption';
import MetricDefinitionValue from '../MetricDefinitionValue';
import AdhocMetric from '../../AdhocMetric';
import columnType from '../../propTypes/columnType';
import savedMetricType from '../../propTypes/savedMetricType';
import adhocMetricType from '../../propTypes/adhocMetricType';
import {
  AGGREGATES,
  AGGREGATES_OPTIONS,
  sqlaAutoGeneratedMetricNameRegex,
  druidAutoGeneratedMetricRegex,
} from '../../constants';

const propTypes = {
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func,
  value: PropTypes.oneOfType([
    PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, adhocMetricType])),
    PropTypes.oneOfType([PropTypes.string, adhocMetricType]),
  ]),
  columns: PropTypes.arrayOf(columnType),
  savedMetrics: PropTypes.arrayOf(savedMetricType),
  isLoading: PropTypes.bool,
  multi: PropTypes.bool,
  clearable: PropTypes.bool,
  datasourceType: PropTypes.string,
};

const defaultProps = {
  onChange: () => {},
  clearable: true,
  savedMetrics: [],
  columns: [],
};

function isDictionaryForAdhocMetric(value) {
  return value && !(value instanceof AdhocMetric) && value.expressionType;
}

function columnsContainAllMetrics(value, nextProps) {
  const columnNames = new Set(
    [...(nextProps.columns || []), ...(nextProps.savedMetrics || [])]
      // eslint-disable-next-line camelcase
      .map(({ column_name, metric_name }) => column_name || metric_name),
  );

  return (
    (Array.isArray(value) ? value : [value])
      .filter(metric => metric)
      // find column names
      .map(metric =>
        metric.column
          ? metric.column.column_name
          : metric.column_name || metric,
      )
      .filter(name => name && typeof name === 'string')
      .every(name => columnNames.has(name))
  );
}

// adhoc metrics are stored as dictionaries in URL params. We convert them back into the
// AdhocMetric class for typechecking, consistency and instance method access.
function coerceAdhocMetrics(value) {
  if (!value) {
    return [];
  }
  if (!Array.isArray(value)) {
    if (isDictionaryForAdhocMetric(value)) {
      return [new AdhocMetric(value)];
    }
    return [value];
  }
  return value.map(val => {
    if (isDictionaryForAdhocMetric(val)) {
      return new AdhocMetric(val);
    }
    return val;
  });
}

function getDefaultAggregateForColumn(column) {
  const { type } = column;
  if (typeof type !== 'string') {
    return AGGREGATES.COUNT;
  }
  if (type === '' || type === 'expression') {
    return AGGREGATES.SUM;
  }
  if (
    type.match(/.*char.*/i) ||
    type.match(/string.*/i) ||
    type.match(/.*text.*/i)
  ) {
    return AGGREGATES.COUNT_DISTINCT;
  }
  if (
    type.match(/.*int.*/i) ||
    type === 'LONG' ||
    type === 'DOUBLE' ||
    type === 'FLOAT'
  ) {
    return AGGREGATES.SUM;
  }
  if (type.match(/.*bool.*/i)) {
    return AGGREGATES.MAX;
  }
  if (type.match(/.*time.*/i)) {
    return AGGREGATES.COUNT;
  }
  if (type.match(/unknown/i)) {
    return AGGREGATES.COUNT;
  }
  return null;
}

export default class MetricsControl extends React.PureComponent {
  constructor(props) {
    super(props);
    this.onChange = this.onChange.bind(this);
    this.onPaste = this.onPaste.bind(this);
    this.onMetricEdit = this.onMetricEdit.bind(this);
    this.checkIfAggregateInInput = this.checkIfAggregateInInput.bind(this);
    this.optionsForSelect = this.optionsForSelect.bind(this);
    this.selectFilterOption = this.selectFilterOption.bind(this);
    this.isAutoGeneratedMetric = this.isAutoGeneratedMetric.bind(this);
    this.optionRenderer = option => <MetricDefinitionOption option={option} />;
    this.valueRenderer = option => (
      <MetricDefinitionValue
        option={option}
        onMetricEdit={this.onMetricEdit}
        columns={this.props.columns}
        multi={this.props.multi}
        datasourceType={this.props.datasourceType}
      />
    );
    this.select = null;
    this.selectRef = ref => {
      if (ref) {
        this.select = ref.select;
      } else {
        this.select = null;
      }
    };
    this.state = {
      aggregateInInput: null,
      options: this.optionsForSelect(this.props),
      value: coerceAdhocMetrics(this.props.value),
    };
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    const { value } = this.props;
    if (
      !isEqual(this.props.columns, nextProps.columns) ||
      !isEqual(this.props.savedMetrics, nextProps.savedMetrics)
    ) {
      this.setState({ options: this.optionsForSelect(nextProps) });

      // Remove metrics if selected value no longer a column
      const containsAllMetrics = columnsContainAllMetrics(value, nextProps);

      if (!containsAllMetrics) {
        this.props.onChange([]);
      }
    }
    if (value !== nextProps.value) {
      this.setState({ value: coerceAdhocMetrics(nextProps.value) });
    }
  }

  onMetricEdit(changedMetric) {
    let newValue = this.state.value.map(value => {
      if (value.optionName === changedMetric.optionName) {
        return changedMetric;
      }
      return value;
    });
    if (!this.props.multi) {
      newValue = newValue[0];
    }
    this.props.onChange(newValue);
  }

  onChange(opts) {
    // if clear out options
    if (opts === null) {
      this.props.onChange(null);
      return;
    }

    let transformedOpts;
    if (Array.isArray(opts)) {
      transformedOpts = opts;
    } else {
      transformedOpts = opts ? [opts] : [];
    }
    const optionValues = transformedOpts
      .map(option => {
        // pre-defined metric
        if (option.metric_name) {
          return option.metric_name;
        }
        // adding a new adhoc metric
        if (option.column_name) {
          const clearedAggregate = this.clearedAggregateInInput;
          this.clearedAggregateInInput = null;
          return new AdhocMetric({
            isNew: true,
            column: option,
            aggregate: clearedAggregate || getDefaultAggregateForColumn(option),
          });
        }
        // existing adhoc metric or custom SQL metric
        if (option instanceof AdhocMetric) {
          return option;
        }
        // start with selecting an aggregate function
        if (option.aggregate_name && this.select) {
          const newValue = `${option.aggregate_name}()`;
          this.select.inputRef.value = newValue;
          this.select.handleInputChange({ currentTarget: { value: newValue } });
          // we need to set a timeout here or the selectionWill be overwritten
          // by some browsers (e.g. Chrome)
          setTimeout(() => {
            this.select.focusInput();
            this.select.inputRef.selectionStart = newValue.length - 1;
            this.select.inputRef.selectionEnd = newValue.length - 1;
          });
        }
        return null;
      })
      .filter(option => option);
    this.props.onChange(this.props.multi ? optionValues : optionValues[0]);
  }

  onPaste(evt) {
    const clipboard = evt.clipboardData.getData('Text');
    if (!clipboard) {
      return;
    }
    this.checkIfAggregateInInput(clipboard);
  }

  checkIfAggregateInInput(input) {
    const lowercaseInput = input.toLowerCase();
    const aggregateInInput =
      AGGREGATES_OPTIONS.find(x =>
        lowercaseInput.startsWith(`${x.toLowerCase()}(`),
      ) || null;
    this.clearedAggregateInInput = this.state.aggregateInInput;
    this.setState({ aggregateInInput });
  }

  optionsForSelect(props) {
    const { columns, savedMetrics } = props;
    const aggregates =
      columns && columns.length
        ? AGGREGATES_OPTIONS.map(aggregate => ({
            aggregate_name: aggregate,
          }))
        : [];
    const options = [
      ...(columns || []),
      ...aggregates,
      ...(savedMetrics || []),
    ];

    return options.reduce((results, option) => {
      if (option.metric_name) {
        results.push({ ...option, optionName: option.metric_name });
      } else if (option.column_name) {
        results.push({ ...option, optionName: `_col_${option.column_name}` });
      } else if (option.aggregate_name) {
        results.push({
          ...option,
          optionName: `_aggregate_${option.aggregate_name}`,
        });
      }
      return results;
    }, []);
  }

  isAutoGeneratedMetric(savedMetric) {
    if (this.props.datasourceType === 'druid') {
      return druidAutoGeneratedMetricRegex.test(savedMetric.verbose_name);
    }
    return sqlaAutoGeneratedMetricNameRegex.test(savedMetric.metric_name);
  }

  selectFilterOption({ data: option }, filterValue) {
    if (this.state.aggregateInInput) {
      let endIndex = filterValue.length;
      if (filterValue.endsWith(')')) {
        endIndex = filterValue.length - 1;
      }
      const valueAfterAggregate = filterValue.substring(
        filterValue.indexOf('(') + 1,
        endIndex,
      );
      return (
        option.column_name &&
        option.column_name.toLowerCase().indexOf(valueAfterAggregate) >= 0
      );
    }
    return (
      option.optionName &&
      (!option.metric_name ||
        !this.isAutoGeneratedMetric(option) ||
        option.verbose_name) &&
      (option.optionName.toLowerCase().indexOf(filterValue) >= 0 ||
        (option.verbose_name &&
          option.verbose_name.toLowerCase().indexOf(filterValue) >= 0))
    );
  }

  render() {
    // TODO figure out why the dropdown isnt appearing as soon as a metric is selected
    return (
      <div className="metrics-select">
        <ControlHeader {...this.props} />
        <Select
          isLoading={this.props.isLoading}
          isMulti={this.props.multi}
          name={`select-${this.props.name}`}
          placeholder={
            this.props.multi
              ? t('choose one or more columns or aggregate functions')
              : t('choose a column or aggregate function')
          }
          options={this.state.options}
          value={this.state.value}
          labelKey="label"
          valueKey="optionName"
          onPaste={this.onPaste}
          clearable={this.props.clearable}
          closeOnSelect
          onChange={this.onChange}
          optionRenderer={this.optionRenderer}
          valueRenderer={this.valueRenderer}
          valueRenderedAsLabel
          onInputChange={this.checkIfAggregateInInput}
          filterOption={this.selectFilterOption}
          selectRef={this.selectRef}
        />
      </div>
    );
  }
}

MetricsControl.propTypes = propTypes;
MetricsControl.defaultProps = defaultProps;
